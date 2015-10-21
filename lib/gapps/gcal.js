var https = require('https');
var url = require('url');

function toQS(obj) {
    var arr = [];
    for(var key in obj) {
        arr.push(key + '=' + obj[key]);
    }
    return arr.join('&');
}
function makeRequest(token, method, uri, data, logger, cb) {
    var timeout, timedOut;

    var options = url.parse(uri);
    options.headers = {
        'Authorization' : 'Bearer ' + token
    };
    if (data) {
        options.headers['content-type'] = 'application/json';
    }
    options.method = method;

    logger.info('GCal requesting HTTP ' + method + ' ' + uri);

    var req = https.request(options, function(res) {
        var resBody = '';
        res.on('data', function(d) { resBody += d; });
        res.on('end', function() {
            if (timedOut) {
                return;
            }
            clearTimeout(timeout);

            logger.info('GCal got response from ' + uri);

            var json;
            try {
                json = JSON.parse(resBody);
            } catch(e) {
                logger.warn('GCal got non-JSON response from ' + uri, resBody);
                cb({
                    message : e,
                    url : uri,
                    responseBody : resBody,
                    requestBody : data
                });
            }
            cb(null, json);
        });
    });

    req.on('error', cb);
    timeout = setTimeout(function() {
        timedOut = true;
        logger.warn('GCal request to ' + uri + ' timed out.');
        req.abort();
        cb('Timed out.');
    }, 20 * 1000);

    if (data) {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
}

function GCal(tokenData, logger) {
    this._tokenData = tokenData;
    this.logger = logger;
}

GCal.prototype.book = function(calendarId, startDate, endDate, cb) {
    var self = this;
    this._tokenData.refresh(function(err) {
        if (err) {
            return cb(err);
        }

        makeRequest(self._tokenData.getToken(), 'POST',
            'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                summary : 'Meeting',
                description : 'This meeting was booked anonymously using the MEAT app.',
                start : {
                    dateTime : startDate.toISOString()
                },
                end : {
                    dateTime : endDate.toISOString()
                },
                attendees : [{
                    email : calendarId,
                    resource : true
                }]
            }, self.logger, cb);
    });
};
GCal.prototype.getUpcomingEvents = function(calendarId, opt_date, cb) {
    if (typeof opt_date === 'function') {
        cb = opt_date;
        opt_date = new Date();
    }

    var self = this;
    this._tokenData.refresh(function(err) {
        if (err) {
            return cb(err);
        }

        makeRequest(self._tokenData.getToken(), 'GET',
            'https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events?' + toQS({
                orderBy : 'startTime',
                singleEvents : true,
                showHiddenInvitations : true,
                timeMin : opt_date.toISOString(),
                timeMax : new Date(opt_date.getTime() + (24 * 60 * 60 * 1000)).toISOString()
            }), undefined, self.logger, cb);
    });
};
GCal.prototype.getEvent = function(calendarId, eventId, cb) {
    var self = this;
    this._tokenData.refresh(function(err) {
        if (err) {
            return cb(err);
        }

        makeRequest(self._tokenData.getToken(), 'GET',
            'https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events/' + eventId,
             undefined, self.logger, cb);
    });
};
GCal.prototype.getRooms = function(cb) {
    var self = this;
    this._tokenData.refresh(function(err) {
        if (err) {
            return cb(err);
        }

        makeRequest(self._tokenData.getToken(), 'GET',
            'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', undefined, self.logger, cb);
    });
};

module.exports = function(tokenData, logger) {
    return new GCal(tokenData, logger);
};
