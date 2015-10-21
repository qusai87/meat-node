# Notes on adding a custom datasource

I'd love to accept PRs for other datasources than Google Apps. I haven't dedicated the time to make it an easy process yet, so it's still a little raw. If you want to add a new datasource besides Google, there are a few things you have to know.

1) You can set the "datasource" to something other than "gapps" in your config. eg "mydatasource", and then you can pass in any config you need in a property of the same name. See [Line 45 of the config](./lib/configTemplate.js#cl-45)

2) You'll have to add "mydatasource" to at least one special case where "gapps" is mentioned in the code. I _believe_ there's only [one place](https://bitbucket.org/aahmed/meat/src/65c27a1730b77f630a1391c072873e2a955ce552/lib/configHandler.js?at=default#cl-109)

3) If you do this, then MEAT will look for a JS file at "/lib/mydatasource/datasource.js" that exports a function. That function will be called with a bunch of config information, and must return the Datasource interface. The config information includes a few paths to directories you can use, and the options coming from the user's config file. Make sure you respect the options (e.g. you should call options.room.filter(room) to test if a room should be returned).

4) The Datasource interface is three functions:

```
{
    rooms : function () { return an array of Room },
    events : function (roomKey) { return an array of Event },
    book : function (roomKey, start Date, end Date, callback(err, event)) {...}
}
```

Where Room is defined at [lib/models/room.js](./lib/models/room.js), and Event is defined at [lib/models/event.js](./lib/models/event.js).


From that point, it's up to you to communicate with your datasource periodically so that you can provide up-to-date information when rooms(), events(), or book() is called.
