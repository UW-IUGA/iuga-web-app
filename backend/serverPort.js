/**
 * Purpose: Listen on the requested backend port, optionally moving upward when a local port is occupied.
 * Expected Request: An HTTP server, preferred port, host, and whether fallback is allowed.
 * Expected Response: The numeric port where the server began listening.
 */

/**
 * @behavior Retries successive ports only for EADDRINUSE when fallback is allowed.
 * @param {import('node:http').Server} server HTTP server to start.
 * @param {number} preferredPort First port to try.
 * @param {string} host Interface to bind.
 * @param {boolean} allowFallback Whether local development may advance to later ports.
 * @returns {Promise<number>} The port that accepted the listener.
 * @exceptions Rejects with the server error if it cannot listen.
 */
export function listenWithAvailablePort(server, preferredPort, host, allowFallback = true) {
  return new Promise((resolve, reject) => {
    let port = preferredPort;

    function tryListen() {
      const onListening = () => {
        cleanup();
        resolve(server.address().port);
      };
      const onError = (error) => {
        cleanup();
        if (allowFallback && error.code === "EADDRINUSE" && port < 65535) {
          port += 1;
          tryListen();
          return;
        }
        reject(error);
      };
      const cleanup = () => {
        server.removeListener("listening", onListening);
        server.removeListener("error", onError);
      };

      server.once("listening", onListening);
      server.once("error", onError);
      server.listen(port, host);
    }

    tryListen();
  });
}
