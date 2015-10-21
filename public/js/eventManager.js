/*globals EventManager: true */
var EventManager = (function() {
    var TimeRange = function(start, end) {
        this.start = start;
        this.end = end;
    };
    TimeRange.prototype = {
        toString : function() {
            if (this.start.getDay() === this.end.getDay()) {
                return this.start.toDateString() + '(' + 
                    this.start.getHours() + ':' + this.start.getMinutes() + ' - ' + 
                    this.end.getHours() + ':' + this.end.getMinutes() + ')';
            }
            else {
                return '(' + this.start.toString() + ' - ' + this.end.toString() + ')';
            }
        },
        intersects : function(dateOrRange) {
            return (dateOrRange instanceof Date) ?
                        dateOrRange >= this.start && dateOrRange < this.end :
                        dateOrRange.end > this.start && dateOrRange.start < this.end;
        },
        isBefore : function(date) {
            return this.end <= date;
        },
        isAfter : function(date) {
            return this.start > date;
        }
    };
    TimeRange.sorter = function(a, b) {
        return a.start < b.start ? -1 :
                a.start > b.start ? 1 :
                a.end < b.end ? -1 :
                a.end > b.end ? 1 :
                0;
    };

    function CalendarEvent(jsonOrEvent) {
        TimeRange.call(this, new Date(jsonOrEvent.start), new Date(jsonOrEvent.end));

        this._title = jsonOrEvent._title || jsonOrEvent.title || 'Unnamed Event';
        this._organizer = jsonOrEvent._organizer || jsonOrEvent.organizer;
    }
    $.extend(CalendarEvent.prototype, TimeRange.prototype, {
        conflictsWith : function (date) {
            return this.intersects(date);
        },
        nextNonConflict : function (afterDate) {
            if (this.intersects(afterDate)) {
                return this.end;
            }
            return afterDate;
        },
        toString : function() {
            return this._title + "(" + TimeRange.prototype.toString.call(this) + ")";
        },
        title : function() { return this._title; },
        organizer : function() { return this._organizer; }
    });
    CalendarEvent.getEvents = function (eventJsonArr) {
        var events = [];
        for (var i = 0; i < eventJsonArr.length; i++) {
            events.push(new CalendarEvent(eventJsonArr[i]));
        }
        return events;
    };
    CalendarEvent.sorter = TimeRange.sorter;

    var Room;
    (function() {
        Room = function (roomJson) {
            var _events = CalendarEvent.getEvents(roomJson.events);

            delete roomJson.events;
            
            this._meta = roomJson;

            var self = this;
            this.events = function(events) {
                if (events) {
                    _events = CalendarEvent.getEvents(events);

                    self._nextFreeTimeCache = {};
                    self._nextEventCache = {};
                } else {
                    return _events;
                }
            };

            this._nextFreeTimeCache = {};
            this._nextEventCache = {};
        };
        function getNextEventCacheObj(afterDate, room) {
            var dateObj = afterDate || DebugSettings.now() || new Date();

            if (room._nextEventCache[dateObj]) {
                return room._nextEventCache[dateObj];
            }

            var minDate = null, minDateEvent = null;
            for (var i = 0, events = room.events(), l = events.length; i < l; i++) {
                var event = events[i];
                if (event.isBefore(afterDate)) {
                    continue;
                }

                minDateEvent = event;
                minDate = event.isAfter(afterDate) ? event.start : afterDate;
                break;
            }

            room._nextEventCache[dateObj] = { event: minDateEvent, date: minDate };
            return room._nextEventCache[dateObj];
        }

        Room.prototype = {
            id : function() { return this._meta.key; },
            name : function() { return this._meta.name; },
            simpleName : EventManagerConfig.removeRegex && EventManagerConfig.removeRegex.test ?
                function() { return this.name().replace(EventManagerConfig.removeRegex, ''); } :
                function() { return this.name(); },
            isBooked : function (dateToCheck) {
                var dateObj = dateToCheck || DebugSettings.now() || new Date();

                for (var i = 0; i < this.events().length; i++) {
                    if(this.events()[i].conflictsWith(dateObj)) {
                        return true;
                    }
                }
                return false;
            },
            upcomingBookings : function(afterDate) {
                var dateObj = afterDate || DebugSettings.now() || new Date();
                var events = this.events().slice();
                while(events.length && events[0].isBefore(dateObj)) {
                    events.shift();
                }
                
                return events;
            },
            nextEvent : function (afterDate) {
                return getNextEventCacheObj(afterDate, this).event;
            },
            nextEventTime : function (afterDate) {
                return getNextEventCacheObj(afterDate, this).date;
            },
            nextFreeTime : function (afterDate) {
                var dateObj = afterDate || DebugSettings.now() || new Date();

                if (this._nextFreeTimeCache[dateObj]) {
                    return this._nextFreeTimeCache[dateObj];
                }

                var maxofMinFreeDates = new Date(dateObj);
                for (var i = 0; i < this.events().length; i++) {
                    var minFreeDate = this.events()[i].nextNonConflict(dateObj);
                    if(minFreeDate > maxofMinFreeDates) {
                        maxofMinFreeDates = minFreeDate;
                    }
                }

                this._nextFreeTimeCache[dateObj] = maxofMinFreeDates;
                return maxofMinFreeDates;
            },
            toAllEventsString : function() {
                return this.events().join(', ');
            },
            toBookedTimesString : function() {
                return this.events().join(', ');
            },
            getBookedTimesToday : function() {
                var now = DebugSettings.now() || new Date(),
                    today = new TimeRange(
                                new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                                new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
                return $.map(
                            this.events(),
                            function(timeRange) {
                                return timeRange.intersects(today) ? timeRange : null;
                            }
                        );
            }
        };
    })();

    var shouldShowRoom = 
        !EventManagerConfig.roomsToShow ?
            function(name) {
                return true;
            } :
        $.isArray(EventManagerConfig.roomsToShow) ?
            function(name) {
                for(var i = 0, l = EventManagerConfig.roomsToShow.length; i < l; i++) {
                    if (EventManagerConfig.roomsToShow[i] === name) {
                        return true;
                    }
                }
                return false;
            } :
        EventManagerConfig.roomsToShow.test ?
            function(name) {
                EventManagerConfig.roomsToShow.lastIndex = 0;
                return EventManagerConfig.roomsToShow.test(name);
            } :
        Logger.log('EventManagerConfig.roomsToShow must be falsy, an Array of strings, or a RegExp object.');
    
    Room.getRooms = function(roomJsonArr) {
        var rooms = [];
        for (var i = 0; i < roomJsonArr.length; i++) {
            var roomJson = roomJsonArr[i];
            if (shouldShowRoom(roomJson.name)) {
                rooms.push(new Room(roomJson));
            }
        }
        return rooms;
    };

    function EventManagerCtor() {
        var url;
        var secretKey;

        var roomsByName;
        var roomsById;
        
        function addNewRoom(room) {
            EventManager.rooms.push(room);
            roomsByName[room.name()] = room;
            roomsById[room.id()] = room;
        }

        this.init = function(rootUrl, secret, callback) {
            url = rootUrl;
            secretKey = secret;
            this.rooms = [];
            roomsByName = {};
            roomsById = {};

            this.update(callback);
        };

        this.update = function(callback) {
            getRooms(function(res) {
                var newRooms = [];
                _.each(Room.getRooms(res.rooms), function(room) {
                    if (room.id() in roomsById) {
                        roomsById[room.id()].events(room.events());
                    } else {
                        newRooms.push(room);
                        addNewRoom(room);
                    }
                });
                
                callback(newRooms);
            }, function(err) { Logger.log('GetAvailableCalendars error', err); });
        };

        function isForbidden(xhr, next) {
            if (xhr.status === 403) {
                window.location.href = url + 'forbidden';
                return;
            }
            return next();
        }

        function errorHandler(onError) {
            return function(xhr) {
                var self = this, args = arguments;
                return isForbidden(xhr, function() { return onError && onError.apply(self, args); });
            };
        }
        
        function getRooms(onSuccess, onError) {
            return $.ajax({
                url : url + 'data/rooms?expand' + (secretKey ? '&secret=' + secretKey : ''),
                dataType : 'json',
                success : onSuccess,
                error : errorHandler(onError)
            });
        }

        function bookRoom(roomKey, startTimeISO, endTimeISO, onSuccess, onError) {
            return $.ajax({
                type: 'POST',
                url : url + 'data/events?room=' + roomKey +
                    '&start=' + startTimeISO + '&end=' + endTimeISO +
                    (secretKey ? '&secret=' + secretKey : ''),
                dataType : 'json',
                success : onSuccess,
                error : errorHandler(onError)
            });
        }

        function getQRCode(roomKey, startTimeISO, endTimeISO, onSuccess, onError) {
            return $.ajax({
                type: 'POST',
                url : url + 'data/qr?room=' + roomKey +
                    '&start=' + startTimeISO + '&end=' + endTimeISO +
                    (secretKey ? '&secret=' + secretKey : ''),
                dataType : 'json',
                success : onSuccess,
                error : errorHandler(onError)
            });
        }
        
        this.getRoom = function (roomName) {
            return roomsByName[roomName];
        };
        this.getRoomById = function (roomId) {
            return roomsById[roomId];
        };
        
        this.bookRoom = function(room, startTime, durationMinutes, onSuccess, onError) {
            var endTime = new Date(startTime);
            endTime.setMinutes(startTime.getMinutes() + durationMinutes);
            
            return bookRoom(room.id(), startTime.toISOString(), endTime.toISOString(), onSuccess, onError);
        };

        this.getQRCode = function(room, startTime, durationMinutes, onSuccess, onError) {
            var endTime = new Date(startTime);
            endTime.setMinutes(startTime.getMinutes() + durationMinutes);
            
            return getQRCode(room.id(), startTime.toISOString(), endTime.toISOString(), onSuccess, onError);
        };
    }

    // TODO - remove the lame capitalized globals so I don't have to name this Ctor something stupid.
    return new EventManagerCtor();
})();
