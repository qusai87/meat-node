/* globals UI : true */
var UI = {
    init : function initUi(thisRoom) { 
        function coalesce(a,b) { return a == null ? b : a; }
        var bookingParams = EventManagerConfig.bookingParameters || {};
        var enabledPeriods = EventManagerConfig.enabledPeriod || {};

        var maxBookableMinutes =          coalesce(bookingParams.maxBookableMinutes, 60),
            minBookableMinutes =          coalesce(bookingParams.minBookableMinutes, 5),
            maxStatusSoonMinutes =        coalesce(bookingParams.maxStatusSoonMinutes, 0),
            minFreeTimeAdequateMinutes =  coalesce(bookingParams.minFreeTimeAdequateMinutes, 0),
            defaultTimeBlock =            coalesce(bookingParams.defaultBookingMinutes, 30),
            timeInterval =                coalesce(bookingParams.bookingIntervalMinutes, 15);

        var enabledDays =                 coalesce(enabledPeriods.days, [
                                            'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
                                          ]),
            enabledTimeRange =            coalesce(enabledPeriods.timeRange, {
                                            start : '00:00',
                                            end   : '24:00'
                                          });

        var idleTimeoutSec =              coalesce(EventManagerConfig.idleTimeoutSeconds, 30),
            displayRoomName =             coalesce(EventManagerConfig.displayRoomName, false);
        
        var ViewModels = (function() {

            function pluralize(num, one, many) {
                return num === 1 ? one : many;
            }

            function minutesBetween(a, b) {
                return Math.ceil((b.getTime() - a.getTime()) / 60000);
            }
        
            function timeBetweenString(a, b, prefix) {
                if (!a || !b) {
                    return "";
                }
                
                var minutes = minutesBetween(a, b);
                
                if (minutes < 1) {
                    return "";
                } else if (minutes < 60) {
                    return prefix + minutes + pluralize(minutes, " minute", " minutes");
                } else {
                    var hours = Math.floor(minutes / 60);
                    if (hours < 24) {
                        return prefix + hours + pluralize(hours, " hour", " hours");
                    } else {
                        return prefix + "a long time";
                    }
                }
            }

            function minutesLeftToday() {
                var now = DebugSettings.now() || new Date();
                var end = new Date(new Date().getTime() + (1000 * 60 * 60 * 24));
                end.setHours(0);
                end.setMinutes(0);
                end.setSeconds(0);

                return (end - now) / 1000 / 60;
            }

            function minutesToDurationString(mins, isOngoing) {
                if (mins < 60) {
                    return isOngoing ?
                        'for ' + mins + pluralize(mins, ' min', ' mins') :
                        'in ' + mins + pluralize(mins, ' min', ' mins');
                }
                if (mins > minutesLeftToday()) {
                    return isOngoing ? 'for a long time' : 'tomorrow';
                } else {
                    var hours = Math.floor(mins / 60);
                    return isOngoing ?
                        'for ' + hours + pluralize(hours, '+ hour', '+ hours') :
                        'in ' + hours + pluralize(hours, ' hour', ' hours');
                }
            }
            
            function getRoomAvailability(room) {
                var now = DebugSettings.now() || new Date(),
                    bookings = room.upcomingBookings(now),
                    availability = {
                        currentBooking : null,
                        nextBooking : null,
                        minutesTilFree : 0,
                        freeAt : now,
                        minutesFreeFor : Infinity
                    };
                    
                if (bookings.length) {
                    var bIndex = 0;
                    var next = bookings[bIndex];
                    if (next.start < now) {
                        availability.currentBooking = {
                            title : next.title(),
                            organizer : next.organizer(),
                            minutesTilStart : 0,
                            minutesTilEnd : minutesBetween(now, next.end)
                        };
                        bIndex++;
                    }
                    next = bookings[bIndex];
                    if (next) {
                        availability.nextBooking = {
                            title : next.title(),
                            organizer : next.organizer(),
                            minutesTilStart : minutesBetween(now, next.start),
                            minutesTilEnd : minutesBetween(now, next.end)
                        };
                    }
                    
                    var freeTime = now, freeMinutes;
                    next = bookings.shift();
                    while(next && minutesBetween(freeTime, next.start) < minBookableMinutes) {
                        freeTime = next.end;
                        next = bookings.shift();
                    }
                    availability.freeAt = freeTime;
                    availability.minutesTilFree = minutesBetween(now, freeTime);
                    if (next) {
                        availability.minutesFreeFor = minutesBetween(freeTime, next.start);
                    }
                }
                
                return availability;
            }
        
            function getStatusClassString(minutesFreeIn, minutesFreeFor) {
                return (
                        minutesFreeIn <= 0 ?
                            'status-free' :
                        minutesFreeIn <= maxStatusSoonMinutes ?
                            'status-soon' :
                            'status-busy'
                    ) + ' ' + (
                        minutesFreeFor < minFreeTimeAdequateMinutes ?
                            'freetime-inadequate' :
                        minutesFreeFor <= maxBookableMinutes ?
                            'freetime-adequate' :
                            'freetime-long'
                    );
            }
                
            return {
                thisRoom : (function() {
                    var room;
                    return {
                        getRoom : function() { return room; },
                        getRoomStatusClassString : function() {
                            var availability = getRoomAvailability(room);
                            return getStatusClassString(availability.minutesTilFree, availability.minutesFreeFor);
                        },
                        getCurrentBooking : function() {
                            var currentBooking = getRoomAvailability(room).currentBooking;
                            if (currentBooking) {
                                currentBooking.when =
                                    minutesToDurationString(currentBooking.minutesTilEnd, true);
                            }
                            return currentBooking;
                        },
                        getNextBooking : function() {
                            var nextBooking = getRoomAvailability(room).nextBooking;
                            if (nextBooking && nextBooking.minutesTilStart) {
                                nextBooking.when =
                                    minutesToDurationString(nextBooking.minutesTilStart, false);
                            }
                            return nextBooking;
                        },
                        setRoom : function(theRoom) {
                            room = theRoom;
                        },
                        getDisplayedBookingCount : function() {
                            var availability = getRoomAvailability(room);
                            var bookings = 0;
                            if (availability.currentBooking) {
                                bookings++;
                            }
                            if (availability.nextBooking) {
                                bookings++;
                            }
                            return bookings;
                        },
                        sync : function() {}
                    };
                })(),
                otherRooms : (function() {
                    var rows = {};
                    
                    function htmlEscape(str) {
                        return str ? str.replace(/'"`<>/g, function(c) {
                            switch(c) {
                                case "'": return "&apos;";
                                case '"': return "&quot;";
                                case "`": return "&apos;";
                                case "<": return "&lt;";
                                case ">": return "&gt;";
                                default: return "&#" + c.charCodeAt(0) + ";";
                            }
                        }) : str;
                    }
                    
                    function rowCompareTo(otherRow) {
                        var now = DebugSettings.now() || new Date(),
                            aRoom = this.getRoom(),
                            bRoom = otherRow.getRoom(),
                            aNextFree = aRoom.nextFreeTime(now),
                            bNextFree = bRoom.nextFreeTime(now),
                            aMinutesToFree = minutesBetween(now, aNextFree),
                            bMinutesToFree = minutesBetween(now, bNextFree);
                        
                        //free at the same time
                        if (aMinutesToFree === bMinutesToFree) {
                            //how long for?
                            var aBookedAt = aRoom.nextEventTime(aNextFree),
                                bBookedAt = bRoom.nextEventTime(bNextFree),
                                aFreeMinutes = aBookedAt ? minutesBetween(aNextFree, aBookedAt) : Infinity,
                                bFreeMinutes = bBookedAt ? minutesBetween(bNextFree, bBookedAt) : Infinity;
                        
                            if (aFreeMinutes === bFreeMinutes || (aFreeMinutes > maxBookableMinutes && bFreeMinutes > maxBookableMinutes)) {
                                return aRoom.name().toLowerCase().localeCompare(bRoom.name().toLowerCase());
                            } else {
                                return aFreeMinutes > bFreeMinutes ? -1 : 1;
                            }
                        } else {
                            //one is free first
                            return aMinutesToFree < bMinutesToFree ? -1 : 1;
                        }
                        
                    }
                    
                    return {
                        createRoomRowViewModel : function(room) {
                            if (rows.hasOwnProperty(room.id())) {
                                throw new Error("A row has already been created for room " + room.simpleName() + " (ID: " + room.id() + ")");
                            }
                            
                            return rows[room.id()] = {
                                    sync : function() {},
                                    getHtmlId : function() { return htmlEscape(room.id()); },
                                    getDisplayName : function() { return room.simpleName(); },
                                    getRoom : function() { return room; },
                                    getCssClass : function() {
                                        var availability = getRoomAvailability(room);
                                        return getStatusClassString(availability.minutesTilFree, availability.minutesFreeFor);
                                    },
                                    compareTo : rowCompareTo
                                };
                        },
                        getRow : function(room) {
                            return rows.hasOwnProperty(room.id()) ? rows[room.id()] : undefined;
                        }
                    };
                })(),
                bookingData : (function() {
                    var bookingRoom,
                        availability,
                        bookingDuration;

                    function maxDuration() {
                        return Math.min(maxBookableMinutes, availability.minutesFreeFor);
                    }
                    function minDuration() {
                        return minBookableMinutes;
                    }

                    return {
                        getBookingRoom : function() { return bookingRoom; },
                        getBookingRoomName : function() { return bookingRoom.simpleName(); },
                        getTimeFreeAtString : function() {
                            return timeBetweenString(DebugSettings.now() || new Date(), availability.freeAt, "in ");
                        },
                        getTimeAvailableString : function() {
                            return availability.minutesFreeFor >= maxBookableMinutes ? maxBookableMinutes + '+' : availability.minutesFreeFor;
                        },
                        addTimeInterval : function() {
                            if (bookingDuration % timeInterval === 0 ) {
                                bookingDuration += timeInterval;
                            } else { // get us to a timeInterval multiple
                                bookingDuration += timeInterval - (bookingDuration % timeInterval);
                            }
                            bookingDuration = Math.min(maxDuration(), bookingDuration);
                            return bookingDuration;
                        },
                        subtractTimeInterval : function() {
                            if (bookingDuration % timeInterval === 0 ) {
                                bookingDuration -= timeInterval;
                            } else { // get us to a timeInterval multiple
                                bookingDuration -= bookingDuration % timeInterval;
                            }
                            bookingDuration = Math.max(minDuration(), bookingDuration);
                            return bookingDuration;
                        },
                        canAddTime : function() {
                            return bookingDuration < maxDuration();
                        },
                        canSubtractTime : function() {
                            return bookingDuration > minDuration();
                        },
                        getBookingDuration : function () {
                            return bookingDuration;
                        },
                        getBookingTime : function () {
                            var date = availability.freeAt || DebugSettings.now() || new Date();
                            date.setSeconds(0, 0);
                            return date;
                        },
                        canBook : function() {
                            return bookingDuration >= minDuration() && bookingDuration <= maxDuration();
                        },
                        setRoom : function(room) {
                            bookingRoom = room;
                            availability = getRoomAvailability(bookingRoom);
                            bookingDuration = availability.minutesFreeFor < defaultTimeBlock ?
                                (availability.minutesFreeFor < timeInterval ?
                                    availability.minutesFreeFor :
                                    Math.floor(availability.minutesFreeFor/timeInterval) * timeInterval
                                ) :
                                defaultTimeBlock;
                        },
                        updateTimes : function() {
                            availability = getRoomAvailability(bookingRoom);
                            bookingDuration = Math.min(bookingDuration, Math.min(maxBookableMinutes, availability.minutesFreeFor));
                        }
                    }; 
                })()
            };
        })();
            
        var Stages = (function() {
            var $body = $('body');
            var $close = $('#close').click(function (e) {
                    revertToPreviousStage();
                    e.stopPropagation();
                });
            var $findOtherRooms = $('#find-other-rooms').click(function (e) {
                    switchTo(RoomList);
                    e.stopPropagation();
                });
            var $bookMe = $('#book-me');
            
            var currStage,
                prevStages = [ ];
            
            function switchTo(newStage, asRevert) {
                if (newStage && currStage !== Switching && currStage !== newStage) {
                    var prevStage = currStage;
                    currStage = Switching;
                    
                    if (prevStage) {
                        // If we're switching "backwards", don't push the current stage onto the stack
                        if (!asRevert) {
                            prevStages.push(prevStage);
                        }
                        $body.queue(prevStage.exit);
                    }
                    
                    $body.queue(newStage.enter).queue(function() {
                        currStage = newStage;
                        $body.dequeue();
                    });
                }
            }
            function revertToPreviousStage() {
                if (currStage !== Switching) {
                    var newStage = prevStages.pop();
                    if (newStage) {
                        switchTo(newStage, true);
                    }
                }
            }
            function revertToInitial() {
                prevStages = prevStages.slice(0, 1);
                revertToPreviousStage();
            }
        
            var Status = (function() {
                    var self,
                        model,
                        idleTimeout,
                        $container,
                        $roomNameTop,
                        $status,
                        $statusMinutes,
                        $events,
                        $currentEvent,
                        $nextEvent;
                    return self = {
                        name : 'status',
                        enter : function() {
                            $body.removeClass().addClass("show-status");
                            $findOtherRooms.removeClass('hidden');
                            $roomNameTop.text(thisRoom.name());
                            $roomNameTop.toggleClass('hidden', !displayRoomName);
                            $status.toggleClass('showing-room-name', displayRoomName);
                            if (idleTimeout) {
                                ActivityMonitor.clearIdleHandler(idleTimeout);
                                idleTimeout = null;
                            }
                            
                            self.update();
                            $status.fadeIn('slow', function() {
                                $status.css('display', '');
                                $body.dequeue();
                            });
                        },
                        exit : function() {
                            $status.fadeOut('fast', function() {
                                $body.removeClass();
                                $roomNameTop.addClass('hidden');
                                $findOtherRooms.addClass('hidden');
                                $bookMe.addClass('hidden');
                                
                                if (!idleTimeout) {
                                    idleTimeout = ActivityMonitor.setIdleHandler(idleTimeoutSec * 1000, revertToInitial);
                                }
                                
                                $body.dequeue();
                            });
                        },
                        init : function($theContainer, thisRoom) {
                            model = ViewModels.thisRoom;
                            model.setRoom(thisRoom);
                            
                            $container = $theContainer;
                            $status = $('#status', $container);

                            $status.add($bookMe).click(function(e) {
                                if (!model.getCurrentBooking()) {
                                    Book.setRoom(model.getRoom());
                                    switchTo(Book);
                                } else {
                                    switchTo(RoomList);
                                }
                                e.stopPropagation();
                            });
                            $roomNameTop = $('#room-name-top', $status);
                            $statusMinutes = $('#minutes-free', $status);
                            $events = $('.events', $status);
                            $currentEvent = $('#current-event', $events);
                            $nextEvent = $('#next-event', $events);
                            
                            GlobalEvents.bind('minuteChanged', self.update);
                            GlobalEvents.bind('roomUpdatedByServer', function(event, room) {
                                if (room === model.getRoom()) {
                                    self.update();
                                }
                            });
                        },
                        update : (function() {
                            function updateEventDOM($eventDOM, event) {
                                if (event) {
                                    $eventDOM.removeClass('hidden');
                                    
                                    var title = event.title || '',
                                        organizer = event.organizer || '',
                                        when = event.when;
                                    $eventDOM.children('.title').text(title);
                                    $eventDOM.children('.organizer').text(organizer);
                                    $eventDOM.children('.when').text(when);
                                    $eventDOM.appendTo($events);
                                } else {
                                    $eventDOM.detach();
                                }
                            }
                            var eventsUpcomingClasses = [0,1,2].map(function(n) {
                                return 'events-upcoming-' + n;
                            });
                            return function() {
                                $container
                                    .removeClass()
                                    .addClass(model.getRoomStatusClassString());
                                
                                $bookMe.toggleClass('hidden', !!model.getCurrentBooking());

                                updateEventDOM($currentEvent, model.getCurrentBooking());
                                updateEventDOM($nextEvent, model.getNextBooking());
                                $status.removeClass(eventsUpcomingClasses.join(' ')).addClass("events-upcoming-" + model.getDisplayedBookingCount());
                            };
                        })()
                    };
                })(),
                RoomList = (function() {
                    var self,
                        model,
                        $rooms,
                        $roomsList;
                    
                    function sortRoomList() {
                    
                        var $rooms = $roomsList.children();
                        var roomArray = $.makeArray($rooms.detach());
                            roomArray.sort(function(a, b) {
                                return $(a).data('model').compareTo($(b).data('model'));
                            });
                        $(roomArray).appendTo($roomsList);
                    }
                    
                    return self = {
                        name : 'rooms',
                        enter : function() {
                            $body.removeClass().addClass("show-rooms");             
                            $rooms.fadeIn('slow',function(){
                                $close.toggleClass('hidden', !thisRoom);
                                $rooms.css('display', '');
                                $body.dequeue();
                            });
                        },
                        exit : function() {
                            $rooms.fadeOut('fast',function() {
                                $body.removeClass('show-rooms');
                                $close.addClass('hidden');
                                $body.dequeue();
                            });
                        },
                        init : function($root) {
                            model = ViewModels.otherRooms;
                            $rooms = $root;
                            $roomsList = $rooms.children('ul');
                            GlobalEvents.bind('roomLoaded', function(event, room) {
                                self.createRow(model.createRoomRowViewModel(room));
                            });
                            GlobalEvents.bind('roomUpdatedByServer', function(event, room) {
                                self.updateRow(room);
                                sortRoomList();
                            });
                            GlobalEvents.bind('minuteChanged', self.updateAllRows);
                            self.reset();
                        },
                        createRow : function(rowModel) {
                            var $row = $('<li><button type="button" class="link-button"></button></li>');
                            $row
                                .attr('id', rowModel.getHtmlId())
                                .data('model', rowModel)
                                .children('button')
                                    .text(rowModel.getDisplayName())
                                    .click(function(e) {
                                        Book.setRoom(rowModel.getRoom());
                                        switchTo(Book);
                                        e.stopPropagation();
                                    });
                            $roomsList.append($row);
                            self.updateRow(rowModel);
                            sortRoomList();
                        },
                        updateRow : function(roomOrRow) {
                            var row = roomOrRow.getCssClass && roomOrRow.getHtmlId ?
                                    roomOrRow :
                                    model.getRow(roomOrRow);
                            $(document.getElementById(row.getHtmlId()))
                                .removeClass()
                                .addClass(row.getCssClass());
                        },
                        updateAllRows : function() {
                            $roomsList.children().each(function() {
                                self.updateRow($(this).data('model'));
                            });
                            sortRoomList();
                        },
                        reset : function() {
                            $roomsList.children().remove();
                        }
                    };
                })(),
                Book = (function() {
                    var self,
                        model,
                        $booking,
                        $roomName,
                        $freeIn,
                        $timeAvailable,
                        $timeRequired,
                        $timeMore,
                        $timeLess,
                        $freeAt;
                        
                        function onTimeRequiredClicked(e) {
                            if (!window.user) {
                                (function() {
                                    var bookingRoom = model.getBookingRoom();
                                    var onComplete = function() {
                                        GlobalEvents.unbind('roomUpdatedByServer', onSuccess);
                                        GlobalEvents.unbind('bookingFailure', onFailure);
                                        
                                    }, onSuccess = function (event, data) {
                                        $('#controls').hide();
                                        $('#QR').removeClass('hidden').find('#QRContent').html("<img src='"+data.qr+"'/>");
                                        if (room === bookingRoom) {
                                            onComplete();
                                        }
                                    }, onFailure = function(event, booking) {
                                        if (booking.room === bookingRoom) {
                                            $timeRequired.text('ERROR');
                                            setTimeout(onComplete, 2000);
                                        }
                                    };
                                    GlobalEvents.bind('showQRCode', onSuccess);
                                    GlobalEvents.bind('QRFailed', onFailure);
                                    GlobalEvents.trigger('getQRCode', {
                                        room : bookingRoom,
                                        title : 'Impromptu Meeting',
                                        time : model.getBookingTime(),
                                        duration : model.getBookingDuration()
                                    });
                                })();
                                return;
                                
                            }
                            if (!$timeRequired.hasClass('disabled')) {
                                var bookingRoom = model.getBookingRoom(),
                                    onComplete = function() {
                                    };
                                $timeRequired
                                    .children('button').text("Booked").end()
                                    .siblings()
                                        .addClass('hidden')
                                    .end()
                                    .queue(function() {
                                        var onComplete = function() {
                                            GlobalEvents.unbind('roomUpdatedByServer', onSuccess);
                                            GlobalEvents.unbind('bookingFailure', onFailure);
                                            
                                            switchTo(thisRoom ? Status : RoomList);
                                            $timeRequired.dequeue();
                                        }, onSuccess = function (event, room) {
                                            if (room === bookingRoom) {
                                                onComplete();
                                            }
                                        }, onFailure = function(event, booking) {
                                            if (booking.room === bookingRoom) {
                                                $timeRequired.text('ERROR');
                                                setTimeout(onComplete, 2000);
                                            }
                                        };
                                        GlobalEvents.bind('roomUpdatedByServer', onSuccess);
                                        GlobalEvents.bind('bookingFailure', onFailure);
                                        GlobalEvents.trigger('bookingAddedByUser', {
                                            room : bookingRoom,
                                            title : 'Impromptu Meeting',
                                            time : model.getBookingTime(),
                                            duration : model.getBookingDuration()
                                        });
                                    });
                            }
                            return false;
                        }
                        function onMoreTimeClicked(e) {
                            if (!$timeMore.hasClass('disabled')) {
                                $timeRequired.children('button').text(model.addTimeInterval());
                                $timeMore.toggleClass('disabled', !model.canAddTime());
                                $timeLess.toggleClass('disabled', !model.canSubtractTime());
                            }
                            
                            return false;
                        }
                        function onLessTimeClicked(e) {
                            if (!$timeLess.hasClass('disabled')) {
                                $timeRequired.children('button').text(model.subtractTimeInterval());
                                $timeMore.toggleClass('disabled', !model.canAddTime());
                                $timeLess.toggleClass('disabled', !model.canSubtractTime());
                            }
                            
                            return false;
                        }
                        
                    return self = {
                        name : 'book',
                        enter : function() {
                            self.reset();
                            $body.removeClass().addClass("show-booking");
                            $booking.fadeIn('slow',function(){
                                $booking.css('display', '');
                                $close.removeClass('hidden');
                                $body.dequeue();
                            });
                        },
                        exit : function() {
                            $booking.fadeOut('fast',function(){
                                $body.removeClass('show-booking');
                                $close.addClass('hidden');
                                $body.dequeue();
                            });
                        },
                        init : function($root) {
                            model = ViewModels.bookingData;
                            
                            GlobalEvents.bind('minuteChanged', function() {
                                if (model.getBookingRoom()) {
                                    model.updateTimes();
                                    $timeAvailable.text(model.getTimeAvailableString());
                                    $timeRequired.children('button').text(model.getBookingDuration()).toggleClass('disabled', !model.canBook());
                                    $freeAt.text(model.getTimeFreeAtString());
                                }
                            });
                            
                            $booking = $root;
                            
                            $timeAvailable = $('#info .time-available', $root);
                            $timeRequired = $("#time-required", $root);
                            $timeMore = $("#time-more", $root);
                            $timeLess = $("#time-less", $root);
                            $roomName = $('#room-name', $root);
                            $freeAt = $('.free-at', $root);

                            $timeRequired.children('button').click(onTimeRequiredClicked);
                            $timeMore.children('button').click(onMoreTimeClicked);
                            $timeLess.children('button').click(onLessTimeClicked);
                        },
                        setRoom : function(room) {
                            model.setRoom(room);
                        },
                        reset : function() {
                            $roomName.text(model.getBookingRoomName());
                            $timeAvailable.text(model.getTimeAvailableString());
                            $timeRequired.removeClass('disabled').children('button').text(model.getBookingDuration());
                            $freeAt.text(model.getTimeFreeAtString());
                            $timeMore.removeClass('hidden').toggleClass('disabled', !model.canAddTime());
                            $timeLess.removeClass('hidden').toggleClass('disabled', !model.canSubtractTime());
                        }
                    };
                })(),
                Switching = {};
            
            return {
                init : function(thisRoom) {
                    Book.init($('#booking'));
                    RoomList.init($('#rooms'));
                    if (thisRoom) {
                        Status.init($('#container'), thisRoom);
                        switchTo(Status);
                    } else {
                        switchTo(RoomList);
                    }
                }
            };
        })();
        
        // By setting the font-size to 1/100th of the body height,
        // we can use rem as a ghetto-vh. So 100rem means 100% of the body height
        // and we can write all our sizes in terms of the viewport height.
        function setFontSize() {
            $(document.documentElement)
                .css('font-size', $(document.body).height() / 100);
        }
        $(window).resize(setFontSize);
        setFontSize();


        var SleepTimer = (function() {
            var $body = $(document.body);

            function isEnabledToday(date) {
                return -1 !== $.inArray(
                        { '1':'Mon', '2':'Tue', '3':'Wed', '4':'Thu', '5':'Fri', '6':'Sat', '0':'Sun' }[date.getDay()],
                        enabledDays);
            }

            function shouldEnable(date) {

                if (!isEnabledToday(date)) {
                    return false;
                }

                var startEnabled = new Date(date);
                var startTime = enabledTimeRange.start.split(':');
                startEnabled.setHours(startTime[0]);
                startEnabled.setMinutes(startTime[1]);
                startEnabled.setSeconds(0);

                var endEnabled = new Date(date);
                var endTime = enabledTimeRange.end.split(':');
                endEnabled.setHours(endTime[0]);
                endEnabled.setMinutes(endTime[1]);
                endEnabled.setSeconds(0);

                return date >= startEnabled && date <= endEnabled;
            }

            function nextEnablementEvent(date) {
                if (shouldEnable(date)) {
                    var endEnabled = new Date(date);
                    var endTime = enabledTimeRange.end.split(':');
                    endEnabled.setHours(endTime[0]);
                    endEnabled.setMinutes(endTime[1]);
                    endEnabled.setSeconds(0);
                    return {
                        event : 'disable',
                        date : endEnabled
                    };
                } else {
                    
                    if (!enabledDays.length) {
                        return null;
                    }


                    var startEnabled = new Date(date);
                    var startTime = enabledTimeRange.start.split(':');
                    startEnabled.setHours(startTime[0]);
                    startEnabled.setMinutes(startTime[1]);
                    startEnabled.setSeconds(0);

                    var nextEnabledDay = new Date(date);
                    if (nextEnabledDay > startEnabled) { // inlcude today only if we're before the normal start time
                        nextEnabledDay = new Date(nextEnabledDay.getTime() + (24 * 60 * 60 * 1000));
                    }
                    while(!isEnabledToday(nextEnabledDay)) {
                        nextEnabledDay = new Date(nextEnabledDay.getTime() + (24 * 60 * 60 * 1000));
                    }

                    startEnabled = new Date(nextEnabledDay);
                    startEnabled.setHours(startTime[0]);
                    startEnabled.setMinutes(startTime[1]);
                    startEnabled.setSeconds(0);

                    return {
                        event : 'enable',
                        date : startEnabled
                    };
                }
            }

            function msBetween(a, b) {
                return b - a;
            }

            return {
                init : function() {

                    var isIdle = false;
                    ActivityMonitor.setIdleHandler(0, function() {
                        isIdle = false;
                        $body.removeClass('disabled');
                    });
                    ActivityMonitor.setIdleHandler(30 * 1000, function() {
                        isIdle = true;
                        var now = DebugSettings.now() || new Date();
                        $body.toggleClass('disabled', !shouldEnable(now));
                    });

                    function onEvent() {
                        var now = DebugSettings.now() || new Date();
                        
                        if (isIdle) {
                            $body.toggleClass('disabled', !shouldEnable(now));
                        }

                        var nextEvent = nextEnablementEvent(new Date(now));
                        var msTilNextEvent = msBetween(now, nextEvent.date);
                        setTimeout(onEvent, msTilNextEvent > 0 ? msTilNextEvent : 1);
                    }
                    onEvent();
                }
            };
        })();


        Stages.init(thisRoom);
        SleepTimer.init();
    }

};