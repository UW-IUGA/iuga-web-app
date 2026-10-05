#!/usr/bin/env node

/**
 * Module dependencies.
 */
var debug = require('debug')('vulnalert:server');
var http = require('http');

const DEFAULT_PORT = '7777';
const startupStartedAt = Date.now();

(async () => {
  const app = await (await import('../app.js')).default;
  const { listenWithAvailablePort } = await import('../serverPort.js');

  /**
   * Get port from environment and store in Express.
   */

  var configuredPort = process.env.PORT;
  var port = normalizePort(configuredPort || DEFAULT_PORT);

  /**
   * Create HTTP server.
   */

  let host = process.env.DEPLOY_ENV === "production" || process.env.DEPLOY_ENV === "staging" || process.env.DEPLOY_ENV === "development" ? '0.0.0.0' : 'localhost';

  var server = http.createServer(app);

  /**
   * Listen on provided port, on all network interfaces.
   */

  listenWithAvailablePort(server, port, host, !configuredPort)
    .then((actualPort) => {
      app.set('port', actualPort);
      onListening(actualPort, host);
    })
    .catch(onError);

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
    console.error(error.message);
    process.exitCode = 1;
  }

  /**
   * Event listener for HTTP server "listening" event.
   */

  function onListening(port, host) {
    console.log(`[startup] Listening at ${host}:${port} after ${Date.now() - startupStartedAt}ms`);
    if (!process.env.DEBUG) {
      return;
    }
      debug('Listening at ' + host + ":" + port);
  }

})().catch(err => console.error(err));
