/*
 * MEATIER
 * https://bitbucket.org/aahmed/meat
 *
 * Copyright (c) 2012 Adam Ahmed
 * Licensed under the MIT license.
 */

var path = require('path');
var util = require('util');

var winston = require('winston');
var extend = require('node.extend');

var configHandler = require('./configHandler');
var logHandler = require('./logHandler');

var config = configHandler.getConfiguration();

var logger, clientLogger, datasource;

function getDatasource(config, logger) {
    var datasourceName = config.options.datasource;
    var datasourceLoader = config.options.datasourceLoader;
    var datasourceConfig = extend(true, {
        main : module,
        logger : logger,
        dataDirectory :  path.join(config.directories.data, datasourceName),
        roomFilter : config.options.rooms.filter
    }, config.options[datasourceName]);

    return datasourceLoader(datasourceConfig);
}

logger = logHandler.getLogger(config);
clientLogger = logHandler.getClientLogger(config);
datasource = getDatasource(config, logger);

function logError(e) {
    var stack;
    if (e && e.stack) {
        // remove the message from the stack
        stack = e.stack.substring(e.stack.indexOf('\n') + 1);
    } else {
        // remove this function and the message from the stack.
        stack = (new Error(e).stack);
        stack = stack.substring(stack.indexOf('\n', stack.indexOf('\n') + 1) + 1);  
    }

    logger.error('Datasource error:\n' +
        util.inspect(e, false, 3, false) + '\n' +
        stack);
}

datasource.on('error', logError);

var app = require('./app')({
        secret : config.options.deviceSecret,
        datasource : datasource,
        logger : clientLogger,
        clientConfig : extend(true, {
            bookingParameters : config.options.booking,
            removeRegex : config.options.rooms.noDisplayRegex
        }, config.options.client)
    });

var port = config.options.server.port || process.env.C9_PORT || 80;
console.log('Start Server at port', port);
app.listen(port, "0.0.0.0");

logger.info('MEAT started.');
process.on('exit', function() {
    logger.info('MEAT stopped.');
});
