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
    const [html, dates, tracker, coach, aiCoach, progressIo, analyticsUi, homeUi, examUi, coachUi, app, questions, practices] = await Promise.all(['/', '/date.js', '/progress.js', '/coach.js', '/ai-coach.js', '/progress-io.js', '/analytics-ui.js', '/home-ui.js', '/exam-ui.js', '/coach-ui.js', '/app.js', '/tasks/base_questions.json', '/tasks/best_practices.json'].map(request));
    assert.ok(html.indexOf('./date.js') < html.indexOf('./coach.js'));
    assert.match(dates, /localDateKey/);
    assert.ok(html.indexOf('./progress.js') < html.indexOf('./coach.js'));
    assert.match(tracker, /recordQuestionAttempt/);
    assert.match(coach, /skillEvents/);
    assert.ok(html.indexOf('./coach.js') < html.indexOf('./ai-coach.js'));
    assert.ok(html.indexOf('./ai-coach.js') < html.indexOf('./progress-io.js'));
    assert.ok(html.indexOf('./progress-io.js') < html.indexOf('./analytics-ui.js'));
    assert.ok(html.indexOf('./analytics-ui.js') < html.indexOf('./home-ui.js'));
    assert.ok(html.indexOf('./home-ui.js') < html.indexOf('./coach-ui.js'));
    assert.match(aiCoach, /buildReviewPayload/);
    assert.match(progressIo, /validateProgressImport/);
    assert.match(analyticsUi, /selectNextQuestions/);
    assert.match(homeUi, /calculateMastery/);
    assert.match(homeUi, /data-home-action/);
    assert.ok(html.indexOf('./home-ui.js') < html.indexOf('./exam-ui.js'));
    assert.ok(html.indexOf('./exam-ui.js') < html.indexOf('./coach-ui.js'));
    assert.match(examUi, /filterQuestions/);
    assert.match(examUi, /data-exam-action="answer"/);
    assert.ok(html.indexOf('./coach-ui.js') < html.indexOf('./app.js'));
    assert.match(coachUi, /data-coach-action="start-control"/);
    assert.match(app, /recordQuestionResult/);
    assert.match(app, /configureCoachUI\(\)/);
    assert.equal(JSON.parse(questions).length, 746);
    assert.equal(JSON.parse(practices).topics.length, 12);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
