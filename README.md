# MEAT-NODE

# Fork from https://bitbucket.org/aahmed/meat.git
##What It Is

MEAT is meant to be displayed outside your meeting rooms on any device with a 
modern web browser (we use iPads, but you can use netbooks, phones, or whatever).
If you're signed up with Google Apps, MEAT will display status for all your 
meeting rooms and allow you to book time on the spot.

##Quick Start

There are two parts to MEAT: the web server, and the display.  Generally all the
setup is on the server, and the displays just hit a url. So...

### Step 1: Get NodeJS with NPM

Download it from http://nodejs.org/

### Step 2: Install MEAT

```
> npm install -g meat
```

### Step 3: Store your data

The Node server requires a directory for saving configuration, logs and other data. Specify an empty directory using the environment variable `$MEAT_HOME`

On *nix:
```
> export MEAT_HOME=/path/to/meat-data
```

On Windows:
```
> set MEAT_HOME=C:\path\to\meat-data
```

### Step 3: First run
```
> meat
```

The first time you run meat, it will populate your `$MEAT_HOME` directory with default configuration.

### Step 4: Configure

Next edit `$MEAT_HOME/config/core.js` with any custom configuration. Since Google limits all requests given under a specific clientId, it is *highly recommended* that you pick your own Google Apps clientId and clientSecret instead of using the provided pair to avoid being throttled due to someone else using up the requests. The provided pair are only for testing. At 10k requests per day, with 1 request per meeting room per 10 minutes, it takes less than 70 people running MEAT with a single room before Google begins refusing requests.

To get your own Google API credentials, go to https://code.google.com/apis/console and sign up for an account. Be sure to turn on the Calendar API under `Services`. To obtain a clientId and clientSecret, go to `API Access` and click the big button to create OAuth access credentials. You want to get credentials for an *Installed Application* and choose "Other" instead of iPhone or Android.

Use the clientId and clientSecret in your `$MEAT_HOME/config/core.js` config file.

### Step 5: Setup a Google Apps MEAT user

Set up a user you want to use MEAT as. All MEAT acivity will be done as this user.
The user needs access to the meeting room calendars and must be allowed to book meetings.
Any calendars you want to view in MEAT must also appear in the user's "My calendars" or "Other calendars" lists in the Google UI at http://calendar.google.com. If they don't appear there, you won't see them through MEAT.

### Step 6: Run the server, authenticate

```
meat
```

The second time you run meat, it will open a browser window to Google OAuth, asking you to give it access to your calendars. Do so using a dedicated MEAT gooogle user if possible. Access will be granted indefinitely, so you won't have to do this again.

As soo as you authenticate, MEAT will start indexing your room calendars.

### Step 7: Meeting Room Displays and Phones
Room displays should hit:

    http://example.com?room={roomName}

Where {roomName} is the full, case-sensitive, URL-encoded name of the room 
they're in front of.

But, if you don't want to type the full, case-sensitive, URL-encoded name of the room,
you can also hit the following URL and select the room from a list at:

    http://example.com/setup/links

If you'd like to have a display show information for all rooms by default, 
then just hit:

    http://example.com/

These URLs can be added to the Home screen on iPads and iPhones for quick booking later on.

## Troubleshooting

### Why can't I see any rooms?

One reason you might not be able to see any meeting rooms is that MEAT by default will only pick up "resource" rooms. See http://support.google.com/a/bin/answer.py?hl=en&answer=1033925 for more info. If you'd like to disable this and include all visible calendars, set { ... gapps: { ... resourcesOnly : false } } in your config file.

Another reason you might not see a room is that the calendar does not appear in your MEAT user's calendar list. Add it to your dedicated MEAT user's "Other calendars" list through the Google website: http://calendar.google.com

## Security

Note: there is little to no security in MEAT. If your Google Apps information needs to be secure, you should run MEAT within a firewalled network. Otherwise, anyone who knows the url can view meeting room information, and make impromptu bookings.

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [grunt](https://github.com/cowboy/grunt).

## Release History
* 0.3.3 - Increase max rooms from 100 to 250 (the max) for larger offices. Will eventually need to start making paged requests.
* 0.3.2 - Fix LICENSE link in package.json
* 0.3.1 - Set preferGlobal
* 0.3.0 - Fix private meetings, add option to display the room name, add ability to see full room list from status page, add "Book me" link for some call-to-action on the status screen, /setup URL for getting links to each room quickly, accessibility improvements.
* 0.2.4 - Fix bug when handling errors during a Booking.
* 0.2.3 - Better styling of the UI. Switch 'X' to 'Back' link
* 0.2.2 - Better datasource logging. Fix bug where timeout when loading events for the last room would cause event info to stop being updated.
* 0.2.1 - Fix mobile Safari bug - no support for function.prototype.bind.
* 0.2.0 - A web server pings Google, and all the client displays talk to the central server for data.
* 0.1.0 - Used now deprecated GApps v2 API. Served static files only and each client pinged Google independently

## What's next?

1. I'd like to improve the UI. It is very simple now (which is good), but I could use space more wisely.
2. I'd like to make it more pluggable. It would be great if people could add their own features and have them show up on the MEAT displays.
3. If there is demand, I would like to expand MEAT outside of google Apps to work with Microsoft Exchange, or whatever other calendar software people are using.

## License
Copyright (c) 2012 Adam Ahmed  
Licensed under the MIT Expat license.
