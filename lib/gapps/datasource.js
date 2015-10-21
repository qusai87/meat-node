var token = require('./tokenHandler');
var gcal = require('./gcal');

var path = require('path');
var util = require('util');

var Room = require('../models/room');
var Event = require('../models/event');
var that;
function wrapGRoom(gcalendar) {
    return new Room(gcalendar.id, gcalendar.summary);
}
function gtimeToDate(gtime, options, ds) {
    if (gtime.dateTime) {
        return new Date(gtime.dateTime);
    }
    if (gtime.date) { // all day
        var date = new Date(gtime.date);
        date.setUTCHours(options.leading ? 0 : 23);
        date.setUTCMinutes(options.leading ? 0 : 59);
        date.setUTCSeconds(options.leading ? 0 : 59);
        date.setUTCMilliseconds(options.leading ? 0 : 999);

        //TODO - which timezone? Need to shift the day to match.
        var timezone = gtime.timeZone || options.defaultTimezone;
        //date.add(timezone.gettimezoneoffset());

        return date;
    }
    ds.emit('error', 'gTime object not recognized:' + JSON.stringify(gtime));
}
function wrapGEvent(gevent, fallbackTimezone, ds) {
    var isPrivate = gevent.visibility === 'private';
    return new Event(
        isPrivate ? "Private event" : gevent.summary,
        isPrivate ? "Hidden organizer" : gevent.organizer.displayName,
        gtimeToDate(gevent.start, { leading: true, defaultTimezone: fallbackTimezone }, ds),
        gtimeToDate(gevent.end, { leading: false, defaultTimezone: fallbackTimezone }, ds)
    );
}

function eventFilter(gevent) {
    //that.logger.info('gevent ' , gevent);
    var attendees = gevent.attendees || [];
    var keep =  gevent.status === 'confirmed' && (
        gevent.visibility === 'private' || attendees.some(function(attendee) {
        // since we asked for events in this room, the room attendee is self=true.
        // We need to check that the room accepted the event and filter it out otherwise.
        return attendee.self && attendee.responseStatus === 'accepted';
    }));
    return keep;
} 


var defaultUpdateSeconds = 60 * 10;

function alwaysTrue() { return true; }

function Datasource(options) {
    that = this;
    this._loadedAny = false;
    this._periodSeconds = options && options.refreshPeriodSeconds || defaultUpdateSeconds;
    this._rooms = [];

    this.logger = options && options.logger || require('winston');

    this._roomFilter = options && options.roomFilter || alwaysTrue;
    this._resourceFilter = options && options.filterResources ? function (calendarJson) {
        if (/@resource.calendar.google.com$/.test(calendarJson.id)) {
            return true;
        }
    } : alwaysTrue;
}
Datasource.prototype = new (require('events').EventEmitter)();

Datasource.prototype.setTokenData = function(tokenData) {
    this.gcal = gcal(tokenData, this.logger);
    this.emit('authenticated');
    var self = this;
    this.updateRooms(this.enable.bind(this));
};

Datasource.prototype.setUpdatePeriod = function(seconds) {
    this.logger.info('Data update period has been changed from ' +
        this._periodSeconds + 's to ' + seconds + 's.');
    this._periodSeconds = seconds;
};

function roomIndexForKey(ds, key) {
    var i = -1;
    ds._rooms.some(function(room, index) {
        if (room.getKey() === key) {
            i = index;
            return true;
        }
    });
    return i;
}
Datasource.prototype.updateRooms = function(cb) {
    var self = this;
    this.logger.info('Updating room list.');
    this.gcal.getRooms(function(err, res) {
        if (err) {
            self.emit('error', err);
            cb(err);
            return;
        }
        if (!res || (!res.items && !res.kind)) {
            self.emit('error', {
                message : 'Unrecognized response.',
                responseBody : res
            });
            return;
        }

        res.items = res.items || [];

        var oldRooms = self._rooms;
        var newRooms = res.items
                        .filter(self._resourceFilter)
                        .map(wrapGRoom)
                        .filter(self._roomFilter);

        self.logger.info('Found ' + res.items.length + ' rooms.');
        if (res.items.length > newRooms.length) {
            var rejected = res.items.filter(function(calendarJson) {
                return !newRooms.some(Room.hasKey(calendarJson.id));
            });
            rejected.forEach(function(calendarJson) {
                self.logger.info('Rejected room ' + calendarJson.summary + ' (' + calendarJson.id + ')');
            });
        }

        // use all the new room data, but migrate over any event data so we don't lose it needlessly.
        newRooms.forEach(function(newRoom) {
            var oldRoomIndex = roomIndexForKey(self, newRoom.getKey());
            if (~oldRoomIndex) {
                newRoom.setEvents(self._rooms[oldRoomIndex].getEvents());
            }
        });
        self._rooms = newRooms;
        cb();
    });
};

Datasource.prototype.load = function(cb) {
    this.logger.info('Loading new room events.');
    var cnt = 0;
    var gcal = this.gcal;
    this._rooms.forEach(function(room) {
        this.logger.info('Requesting events for ' + room.getName());
        cnt++;
        gcal.getUpcomingEvents(room.getKey(), function(err, res) {
            cnt--;

            if (err) {
                this.logger.error('Error requesting events for ' + room.getName(), err);
                this.emit('error', err);
            } else if (!res || (!res.items && !res.kind)) {
                this.logger.error('Unrecognized response when requesting events for ' + room.getName(), res);
                this.emit('error', {
                    message : 'Unrecognized response.',
                    responseBody : res
                });
            } else {
                res.items = res.items || [];

                this.logger.info('Got back ' + res.items.length + ' events for ' + room.getName() + '.');
                
                var filteredEvents = res.items.filter(eventFilter).map(function(gevent) {
                    return wrapGEvent(gevent, res.timeZone, this);
                }.bind(this));

                if (filteredEvents.length !== res.items.length) {
                    res.items.filter(function() { return !eventFilter.apply(this, arguments); }).forEach(function(item) {
                        this.logger.info('Event rejected for ' + room.getName()+ ': ' +
                            (item.id || 'No ID') + ' (' + (item.summary || 'No summary') + ')');
                    }.bind(this));
                }

                room.setEvents(filteredEvents);
            }

            if (!cnt) {
                this.logger.info('Finished loading events for all rooms.');
                cb();
            }
        }.bind(this));
    }.bind(this));
};

function beginUpdates(ds, intervalMs) {
    if (ds.enabled) {
        ds.load(function() {
            ds.logger.info('Queuing another event load in ' + (intervalMs/1000) + 's');
            setTimeout(function() { beginUpdates(ds, intervalMs); }, intervalMs);
        });
    } else {
        ds.disabling = false;
    }
}

Datasource.prototype.enable = function() {
    if (!this.gcal) {
        this.logger.warn('datasource is not initialized. Not enabling data updates.');
        return;
    }
    this.logger.info('Enabling data updates.');

    // don't start a new loop if we're already enabled or if we disabled and reenabled fast enough that
    // the update loop wasn't interrupted.
    var requiresRestart = !this.enabled && !this.disabling;
    
    this.disabling = false;
    this.enabled = true;

    if (requiresRestart) {
        beginUpdates(this, this._periodSeconds * 1000);
    }
};
Datasource.prototype.disable = function() {
    this.logger.info('Disabling data updates.');
    this.disabling = this.enabled;
    this.enabled = false;
};

Datasource.prototype.rooms = function() {
    return this._rooms;
};
Datasource.prototype.events = function(roomKey) {
    var events;
    this._rooms.forEach(function(room) {
        if (room.getKey() === roomKey) {
            events = room.getEvents();
        }
    });
    return events || [];
};

function roomResponse(gevent, roomKey) {
    var response;
    gevent.attendees.some(function(attendee) {
        return attendee.email === roomKey && (response = attendee.responseStatus);
    });
    return response;
}
function pollForConfirmation(ds, roomKey, eventId, cb, triesLeft) {
    ds.gcal.getEvent(roomKey, eventId, function(err, gevent) {
        var response;
        if (err || !gevent || !gevent.attendees) {
            ds.emit('error', new Error('Unrecognized response for event request:\n' + util.inspect(err || gevent)));
        } else {
            response = roomResponse(gevent, roomKey);
        }
        if (response && response !== 'needsAction') {
            cb(null, gevent);
        } else {
            if (triesLeft === 0) {
                var lastResponseStr = util.inspect(gevent);
                return cb(new Error('Could not get a valid response. Last response was:\n' + lastResponseStr));
            }
            pollForConfirmation(ds,roomKey, eventId, cb, triesLeft != null ? triesLeft - 1 : 2);
        }
    });
}

Datasource.prototype.book = function(roomKey, startDate, endDate, cb) {
    var index = roomIndexForKey(this, roomKey);
    var self = this;
    if (~index) {
        this.gcal.book(roomKey, startDate, endDate, function(err, gevent) {
            if (err) {
                self.emit('error', err);
                return cb(err);
            }
            if (!gevent.start) {
                self.emit('error', gevent);
                return cb(gevent);
            }

            pollForConfirmation(self, roomKey, gevent.id, function(err, gevent) {
                if (err) {
                    self.emit('error', err);
                    return cb(err);
                }

                var keep = gevent.status === 'confirmed' && gevent.attendees.some(function(attendee) {
                    // We need to check that the room accepted the event and filter it out otherwise.
                    return attendee.email === roomKey && attendee.responseStatus === 'accepted';
                });

                var event = wrapGEvent(gevent, null, self);
                    
                if (keep) {
                    var index = roomIndexForKey(self, roomKey);
                    if (~index) {
                        self._rooms[index].addEvent(event);
                    }
                    cb(null, event);
                } else {
                    self.logger.log('Declined meeting:\n' + util.inspect(gevent));
                    cb({
                        status: 'declined',
                        event : event
                    });
                }
            });
        });   
    } else {
        cb(new Error('Room not found.'));
    }
};


module.exports = function(config) {
    var ds = new Datasource(config);

    token.getTokenData(
        config.clientId,
        config.clientSecret,
        config.dataDirectory,
        function(err, tokenData) {
            if (err) {
                ds.emit('error', err);
                return;
            }

            ds.setTokenData(tokenData);
        }
    );

    return ds;
};
