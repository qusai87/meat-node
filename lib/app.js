/*
 * MEATIER
 * https://bitbucket.org/aahmed/meat
 *
 * Copyright (c) 2012 Adam Ahmed
 * Licensed under the MIT license.
 */

var path = require('path');

var express = require("express");
var passport = require("passport");

var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;


var logStream = require('./logStream');

module.exports = function(options) {
    var secret = options.secret;
    var datasource = options.datasource;
    var logger = options.logger;

    var clientConfig = options.clientConfig;

    function knowsSecret(theirKey) {
        return !secret || secret === theirKey;
    }

    var app = express.createServer();
    // start soecket IO server
    var io = require('socket.io').listen(8080, function () {
        console.log('listening on *:8080');
    });
    io.set('origins', '*:*');

    var sockets = {};
    io.sockets.on('connection', function (socket) {
        console.log('a user with ket connected!');
        socket.on('setKey', function (key) {
            console.log('a ket set',key);

            sockets[key] = socket;
        });
    });

    app.configure(function() {
        app.set('view engine', 'jade');
        app.set('views', __dirname + '/views');
        //app.use(express.logger());
        app.use(express.cookieParser());
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(express.session({ secret: 'keyboard cat' }));
        // Initialize Passport!  Also use passport.session() middleware, to support
        // persistent login sessions (recommended).
        app.use(passport.initialize());
        app.use(passport.session());
        app.use(app.router);
        app.use(express.static(__dirname + '/../public'));
        app.use(express.logger({ stream : logStream(logger, 'info') }));
        app.use(function(req, res, next) {
          res.header("Access-Control-Allow-Origin", "http://localhost");
          res.header("Access-Control-Allow-Credentials", "true");
          res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-requested-with ");
          next();
        });
    });

    passport.use(new GoogleStrategy({  
            clientID: "623018305970-nq30nm2bqj4jiuqkdbsttro7khsrl38c.apps.googleusercontent.com",
            clientSecret: "xOFyNADXxgBkrVIuK2zyWMxd",
            callbackURL: "http://localhost:3000/oauth2callback"
        },
        function(accessToken, refreshToken, profile, done) {
            process.nextTick(function () {
                return done(null, profile);
            });
        }
    ));

    passport.serializeUser(function(user, done) {
      done(null, user);
    });

    passport.deserializeUser(function(obj, done) {
      done(null, obj);
    });


    function checkSecret(req, res, next) {
        if (knowsSecret(req.query.secret)) {
            return next();
        }
        res.redirect('/forbidden');
    }

    function ensureAuthenticated(req, res, next) {  
        if (req.isAuthenticated()) { return next(); }
        res.redirect('/');
    }


    app.get('/', function(req, res, next) {
        return res.render('index',{ user: req.user });
    });

    app.get('/forbidden', function(req, res, next) {
        return res.render('forbidden', { status : 403 });
    });

    app.get('/auth', function(req, res, next) {
        return res.render('auth');
    });

    app.get('/auth/google', passport.authenticate('google',  
        { scope: ['https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email'] }),
        function(req, res){} // this never gets called
    );

    app.get('/oauth2callback', 
        passport.authenticate('google',  
        { successRedirect: '/', failureRedirect: '/login' }
    ));  

    app.get('/logout', function(req, res){
      req.logout();
      res.redirect('/');
    });

    app.get('/login', function(req, res){
      res.render('login', { user: req.user });
    });

    app.get('/panel/:key', function (req, res) {
        var key = req.params.key;
        console.log('Validating key',key);

        if (key in sockets) {
            return res.render('mobile.jade', {key:key});
        }
        return res.render('forbidden', { status : 403 });
    });



    app.post('/data/qr', function(req, res, next) {
        var tfa = require('2fa');

        tfa.generateKey(32, function(err, key) {
          // crypto secure hex key with 32 characters

          // generate a google QR code so the user can save their new key
          // tfa.generateGoogleQR(name, accountname, secretkey, cb)
          tfa.generateGoogleQR('Souq', 'qtabbal@souq.com', key, function(err, qr) {
            // data URL png image for google authenticator
            //console.log(qr);

            res.json({
                qr : qr
            });
          });
        });
    });

    // allow regexs, but otherwise JSON.stringify
    function shtringify(obj) {
        if (obj instanceof RegExp) {
            return obj.toString();
        }
        if (obj instanceof Array) {
            return '[' + obj.map(shtringify).join(', ') + ']';
        }
        if (obj != null && typeof obj === 'object') {
            return '{' + Object.keys(obj).map(function(key) {
                return '"' + key + '" : ' + shtringify(obj[key]);
            }).join(', ') + '}';
        }
        return JSON.stringify(obj);
    }

    app.get('/js/conf.js', function(req, res, next) {
        res.header('Content-Type', 'text/javascript');

        return res.send('var EventManagerConfig = ' + shtringify(clientConfig));
    });

    function toJSON(obj) {
        return obj.toJSON();
    }

    app.get('/data/time', function(req, res, next) {
        res.json({
            datetime : new Date().toISOString()
        });
    });

    app.get('/data/rooms', checkSecret, function(req, res, next) {
        var shouldExpand = req.query.expand !== undefined;
        var rooms = (datasource.rooms() || []).map(function(room) {
            return room.toJSON(shouldExpand);
        });
        /*if (req.query.expand !== undefined) {
            rooms.forEach(function(room) {
                room.events = (datasource.events(room.key) || []).map(toJSON);
            });
        }*/
        res.json({
            rooms : rooms
        });
    });


    app.get('/data/events', checkSecret, function(req, res, next) {
        res.json({
            events : (datasource.events(req.query.room) || []).map(toJSON)
        });
    });

    app.post('/data/events', checkSecret, function(req, res, next) {
        var start = req.query.start && new Date(req.query.start);
        var end = req.query.end && new Date(req.query.end);

        datasource.book(req.query.room, start, end, function(err, event) {
            if (err) {
                if (err.status === 'declined') {
                    return res.send(409);
                }
                return next(err);
            }
            res.json(event.toJSON());
        });
    });

    app.get('/setup', checkSecret, function(req, res, next) {
        res.redirect('/setup/links');
    });

    app.get('/setup/links', checkSecret, function(req, res, next) {
        var rooms = (datasource.rooms() || []).map(function(room) {
            return {
                key: room.getKey(),
                name: room.getName(),
                url: req.protocol + '://' + req.headers.host + '/?room=' + encodeURIComponent(room.getName())
            };
        }).sort(function(a, b) {
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        return res.render('setup', { rooms : rooms });
    });

    return app; 
};