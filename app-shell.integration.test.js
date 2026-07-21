const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = __dirname;
const server = http.createServer((request, response) => {
  let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (name === '/') name = '/index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, body) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); return response.end(); }
    response.writeHead(200); response.end(body);
  });
});

test('serves the complete app shell and personal-coach modules', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const request = name => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: name }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => response.statusCode === 200 ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(new Error(name + ': ' + response.statusCode)));
  }).on('error', reject));

  try {
    const [html, tracker, coach, app, questions] = await Promise.all(['/', '/progress.js', '/coach.js', '/app.js', '/tasks/base_questions.json'].map(request));
    assert.ok(html.indexOf('./progress.js') < html.indexOf('./coach.js'));
    assert.match(tracker, /recordQuestionAttempt/);
    assert.match(coach, /skillEvents/);
    assert.match(app, /recordQuestionResult/);
    assert.equal(JSON.parse(questions).length, 746);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
