#!/usr/bin/env node

/**
 * Module dependencies.
 */
var debug = require('debug')('vulnalert:server');
var http = require('http');

const DEFAULT_PORT = '7777';

(async () => {
  const app = await (await import('../app.js')).default;

  /**
   * Get port from environment and store in Express.
   */

  var port = normalizePort(process.env.PORT || DEFAULT_PORT);
  app.set('port', port);

  /**
   * Create HTTP server.
   */

  let host = process.env.DEPLOY_ENV === "production" ? '0.0.0.0' : 'localhost';

  var server = http.createServer(app);

  /**
   * Listen on provided port, on all network interfaces.
   */

  server.listen(port, host);
  server.on('error', onError);
  server.on('listening', onListening);

  /**
   * Normalize a port into a number, string, or false.
   */

  function normalizePort(val) {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
      // named pipe
      return val;
    }

    if (port >= 0) {
      // port number
      return port;
    }

    return false;
  }

  /**
   * Event listener for HTTP server "error" event.
   */

  function onError(error) {
    if (error.syscall !== 'listen') {
      throw error;
    }

    var bind = typeof port === 'string'
      ? 'Pipe ' + port
      : 'Port ' + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
  }

  /**
   * Event listener for HTTP server "listening" event.
   */

  function onListening() {
    let host = process.env.DEPLOY_ENV === "production" ? '0.0.0.0' : 'localhost';
    let port = process.env.PORT ? process.env.PORT : DEFAULT_PORT;

    if (!process.env.DEBUG) {
      console.log('Listening at ' + host + ":" + port);
    } else {
      debug('Listening at ' + host + ":" + port);
    }
  }

})().catch(err => console.error(err));
