const { createAppServer } = require('./server.js');

const server = createAppServer();

server.listen(4173, '127.0.0.1');

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
