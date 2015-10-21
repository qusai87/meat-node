(function() {
    var params = ParameterParser.parse();
    var roomName = params.room;
    
    function runAtMidnight(func) {
        var oneDay = 1000 * 60 * 60 * 24;
        
        var midnight = new Date(new Date().getTime() + oneDay);
        midnight.setSeconds(0); midnight.setMinutes(0);midnight.setHours(0);
        
        // paranoia
        while (midnight < new Date()) {
            midnight = new Date(midnight.getTime() + oneDay);
        }
        
        setTimeout(func, midnight - new Date());
    }
    function runEveryNMinutesOnTheMthSecond(n, m, func) {
        var firstDelaySec = m - (DebugSettings.now() || new Date()).getSeconds();
        if (firstDelaySec <= 0) {
            firstDelaySec +=  60;
        }

        setTimeout(function() {
            try {
                func();
                setInterval(function() {
                    func();
                }, 1000 * 60 * n);
            } catch (err) {
                Logger.log("Error in repeated function.", err);
            }
        }, firstDelaySec * 1000);
    }
    
    function getRootUrl() {
        var qsStart = window.location.href.indexOf('?');
        var hashStart = window.location.href.indexOf('#');
        var url = window.location.href.substring(0,
            Math.min(~qsStart ? qsStart : Infinity, ~hashStart ? hashStart : Infinity));
        
        if (url.lastIndexOf('/') !== url.length - 1) {
            url += '/';
        }
        return url;
    }

    function updateRooms() {
        EventManager.update(function success(newRooms) {
            _.each(newRooms, function(room) {
                GlobalEvents.trigger('roomLoaded', room);
            });
            _.each(EventManager.rooms, function(room) {
                GlobalEvents.trigger('roomUpdatedByServer', room);
            });
        }, function error() {
            console.log('Error while updating rooms.');
        });
    }

    DebugSettings.init(getRootUrl());
    EventManager.init(getRootUrl(), params.secret, function(newRooms) {
        var thisRoom = roomName ? EventManager.getRoom(roomName) : undefined;
        
        if (roomName && !thisRoom) {
            $('#errormsg')
                .css('font-size','18px')
                .text('You entered an invalid room name.  The room could not be found.')
                .removeClass('hidden');
            $('#container').addClass('hidden');
            return;
        }
            
        UI.init(thisRoom);
        
        _.each(newRooms, function(room) {
            GlobalEvents.trigger('roomLoaded', room);
        });

        runEveryNMinutesOnTheMthSecond(1, 31, updateRooms);
        
        //update UI when the minute ticks over.
        runEveryNMinutesOnTheMthSecond(1, 1, function() { GlobalEvents.trigger('minuteChanged'); });
    });
    
    GlobalEvents.bind('bookingAddedByUser', function(event, booking) {
        EventManager.bookRoom(booking.room, booking.time, booking.duration,
            function success() {            
                updateRooms();
            },
            function failure() {
                GlobalEvents.trigger('bookingFailure', booking);
            }
        );
    });

    GlobalEvents.bind('getQRCode', function(event, booking ) {
        EventManager.getQRCode(booking.room, booking.time, booking.duration,
            function success(data) {           
                GlobalEvents.trigger('showQRCode', data);
            },
            function failure() {
                GlobalEvents.trigger('bookingFailure', booking);
            }
        );
    });
    
    // update MEAT from server everyday at midnight.
    runAtMidnight(function() { window.location.reload(); });
})();
