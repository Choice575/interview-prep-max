const { URL } = require('node:url');
const { WebSocketServer } = require('ws');

function json(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  response.end(payload);
}

function errorStatus(error) {
  return Number.isInteger(error && error.status) ? error.status : 500;
}

function decodeSessionId(value) {
  try { return decodeURIComponent(value); }
  catch (_) { return null; }
}

function readJson(request, limitBytes) {
  return new Promise((resolve, reject) => {
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      const error = new Error('Content-Type must be application/json');
      error.status = 415;
      reject(error);
      request.resume();
      return;
    }
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > limitBytes) {
      const error = new Error('Request body is too large');
      error.status = 413;
      reject(error);
      request.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size <= limitBytes) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > limitBytes) {
        const error = new Error('Request body is too large');
        error.status = 413;
        reject(error);
        return;
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) {
        const error = new Error('Request body contains invalid JSON');
        error.status = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function createPolygonGateway(options = {}) {
  const service = options.service;
  if (!service) throw new Error('Polygon service is required');
  const maxBodyBytes = Math.max(256, Math.min(1024 * 1024, Number(options.maxBodyBytes) || 32 * 1024));
  const websocket = new WebSocketServer({
    noServer: true,
    clientTracking: false,
    maxPayload: 8 * 1024,
    perMessageDeflate: false,
    handleProtocols: protocols => protocols.has('ipmax-polygon') ? 'ipmax-polygon' : false
  });

  function auth(request) {
    return request.headers.authorization || '';
  }

  async function handler(request, response) {
    let url;
    try { url = new URL(request.url, 'http://polygon.local'); }
    catch (_) { return json(response, 400, { error: 'Bad request' }); }
    if (!url.pathname.startsWith('/api/polygon/')) return json(response, 404, { error: 'Not found' });

    try {
      if (url.pathname === '/api/polygon/tasks' && request.method === 'GET') {
        return json(response, 200, { tasks: service.taskList() });
      }
      if (url.pathname === '/api/polygon/sessions' && request.method === 'POST') {
        service.authorise(auth(request));
        const result = await service.createSession(auth(request), await readJson(request, maxBodyBytes));
        return json(response, 201, { session: result });
      }
      const match = url.pathname.match(/^\/api\/polygon\/sessions\/([^/]+)(?:\/(check))?$/);
      if (match) {
        const id = decodeSessionId(match[1]);
        if (id === null) return json(response, 400, { error: 'Bad session id' });
        if (match[2] === 'check' && request.method === 'POST') {
          service.authorise(auth(request));
          return json(response, 200, await service.checkSession(auth(request), id));
        }
        if (!match[2] && request.method === 'GET') {
          service.authorise(auth(request));
          return json(response, 200, { session: await service.getSession(auth(request), id) });
        }
        if (!match[2] && request.method === 'DELETE') {
          service.authorise(auth(request));
          return json(response, 200, await service.deleteSession(auth(request), id));
        }
      }
      return json(response, 405, { error: 'Method not allowed' });
    } catch (error) {
      const status = errorStatus(error);
      return json(response, status, {
        error: status >= 500 ? 'Polygon service is temporarily unavailable' : error.message,
        code: error && error.code || undefined
      });
    }
  }

  function attachWebSocket(server) {
    server.on('upgrade', (request, socket, head) => {
      let url;
      try { url = new URL(request.url, 'http://polygon.local'); }
      catch (_) { socket.destroy(); return; }
      const match = url.pathname.match(/^\/api\/polygon\/sessions\/([^/]+)\/terminal$/);
      const protocols = String(request.headers['sec-websocket-protocol'] || '')
        .split(',').map(value => value.trim()).filter(Boolean);
      const token = protocols[0] === 'ipmax-polygon' ? (protocols[1] || '') : '';
      const id = match ? decodeSessionId(match[1]) : null;
      if (!match || id === null) {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      if (!service.authoriseTerminal(id, token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      websocket.handleUpgrade(request, socket, head, client => {
        websocket.emit('connection', client, request, id, token);
      });
    });
    websocket.on('connection', (client, _request, id, token) => {
      let terminal;
      try { terminal = service.openTerminal(id, token); }
      catch (_) { client.close(1011, 'Terminal unavailable'); return; }
      const forward = (chunk) => {
        if (client.readyState === 1) client.send(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      };
      terminal.stdout?.on('data', forward);
      terminal.stderr?.on('data', forward);
      client.on('message', data => {
        if (terminal.stdin && !terminal.stdin.destroyed) terminal.stdin.write(data);
      });
      const close = () => { try { terminal.stdin?.end(); terminal.kill?.(); } catch (_) {} };
      client.once('close', close);
      client.once('error', close);
      terminal.once?.('close', () => { if (client.readyState === 1) client.close(); });
    });
  }

  return { handler, attachWebSocket };
}

module.exports = { createPolygonGateway, readJson };
