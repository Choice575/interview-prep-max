const http = require('node:http');
const { createDockerAdapter } = require('./docker-adapter.js');
const { createPolygonGateway } = require('./gateway.js');
const { createPolygonService } = require('./service.js');

const token = String(process.env.IPMAX_SYNC_TOKEN || '').trim();
const port = Number(process.env.POLYGON_PORT || 4180);
const host = process.env.POLYGON_HOST || '0.0.0.0';
const adapter = createDockerAdapter();
const service = createPolygonService({
  syncToken: token,
  docker: adapter,
  ttlMs: Number(process.env.POLYGON_TTL_MS) || 20 * 60 * 1000,
  maxSessions: Number(process.env.POLYGON_MAX_SESSIONS) || 1
});
const gateway = createPolygonGateway({
  service,
  maxBodyBytes: 32 * 1024
});
const server = http.createServer(gateway.handler);
gateway.attachWebSocket(server);

async function cleanup() {
  try { await service.cleanupExpired(); } catch (error) { console.error('polygon cleanup failed:', error.message); }
}

(async () => {
  await adapter.cleanupOrphans();
  server.listen(port, host, () => console.log(`Polygon runner listening on http://${host}:${port}`));
  setInterval(cleanup, 30_000).unref();
})().catch(error => {
  console.error('Polygon runner failed to start:', error.message);
  process.exitCode = 1;
});

async function shutdown(signal) {
  console.log(`Polygon runner stopping on ${signal}`);
  await service.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
