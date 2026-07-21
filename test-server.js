const fs = require('fs');
const http = require('http');
const path = require('path');

const root = __dirname;
const contentTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

http.createServer((request, response) => {
  let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (name === '/') name = '/index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, body) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); return response.end(); }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  });
}).listen(4173, '127.0.0.1');
