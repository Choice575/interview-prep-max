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
    const [html, dates, tracker, coach, aiCoach, progressIo, analyticsUi, homeUi, examUi, studyUi, coachUi, app, questions, practices] = await Promise.all(['/', '/date.js', '/progress.js', '/coach.js', '/ai-coach.js', '/progress-io.js', '/analytics-ui.js', '/home-ui.js', '/exam-ui.js', '/study-ui.js', '/coach-ui.js', '/app.js', '/tasks/base_questions.json', '/tasks/best_practices.json'].map(request));
    assert.ok(html.indexOf('./date.js') < html.indexOf('./coach.js'));
    assert.match(dates, /localDateKey/);
    assert.ok(html.indexOf('./progress.js') < html.indexOf('./coach.js'));
    assert.match(tracker, /recordQuestionAttempt/);
    assert.match(coach, /skillEvents/);
    assert.ok(html.indexOf('./coach.js') < html.indexOf('./ai-coach.js'));
    assert.ok(html.indexOf('./ai-coach.js') < html.indexOf('./progress-io.js'));
    assert.ok(html.indexOf('./progress-io.js') < html.indexOf('./offline-ui.js'));
    assert.ok(html.indexOf('./offline-ui.js') < html.indexOf('./sources-ui.js'));
    assert.ok(html.indexOf('./sources-ui.js') < html.indexOf('./catalog-ui.js'));
    assert.ok(html.indexOf('./catalog-ui.js') < html.indexOf('./chapter-ui.js'));
    assert.ok(html.indexOf('./chapter-ui.js') < html.indexOf('./interview-practice-ui.js'));
    assert.match(html, /id="page-chapter"/);
    assert.match(html, /id="page-catalog"/);
    assert.match(html, /data-page="catalog"/);
    assert.ok(html.indexOf('./interview-practice-ui.js') < html.indexOf('./analytics-ui.js'));
    assert.match(html, /id="page-interview"/);

    // Form errors must be announced to assistive tech, not only via alert().
    assert.match(html, /id="cq-error"[^>]*role="alert"/,
      'the custom question form needs a live error region');
    assert.match(html, /id="cq-error"[^>]*aria-live="assertive"/,
      'the error region must be announced assertively');
    assert.doesNotMatch(app, /alert\('Заполните вопрос/,
      'validation must use the live region instead of alert()');
    assert.match(app, /showCustomQError/, 'app.js needs a form error helper');
    assert.match(html, /id="sources-report-body"/);
    assert.match(html, /id="offline-report-body"/);
    assert.match(html, /aria-live="polite"|offline-report-body/);
    assert.ok(html.indexOf('./analytics-ui.js') < html.indexOf('./home-ui.js'));
    assert.ok(html.indexOf('./home-ui.js') < html.indexOf('./coach-ui.js'));
    assert.match(aiCoach, /buildReviewPayload/);
    assert.match(progressIo, /validateProgressImport/);
    assert.match(analyticsUi, /selectNextQuestions/);
    assert.match(homeUi, /calculateMastery/);
    assert.match(homeUi, /data-home-action/);
    assert.match(html, /id="study-week-outcome"/);
    assert.match(html, /id="study-ai-track"/);
    assert.ok(html.indexOf('./home-ui.js') < html.indexOf('./exam-ui.js'));
    assert.ok(html.indexOf('./exam-ui.js') < html.indexOf('./study-ui.js'));
    assert.match(examUi, /filterQuestions/);
    assert.match(examUi, /data-exam-action="answer"/);
    assert.ok(html.indexOf('./study-ui.js') < html.indexOf('./coach-ui.js'));
    assert.match(studyUi, /renderTechnologyStatus/);
    assert.match(studyUi, /data-study-criterion/);
    assert.match(studyUi, /renderAITrack/);
    assert.ok(html.indexOf('./coach-ui.js') < html.indexOf('./app.js'));
    assert.match(coachUi, /data-coach-action="start-control"/);
    assert.match(app, /recordQuestionResult/);
    assert.match(app, /configureCoachUI\(\)/);
    assert.equal(JSON.parse(questions).length, 818);
    assert.equal(JSON.parse(practices).topics.length, 13);
    const labelledControls = [
      'cq-topic', 'cq-level', 'cq-category', 'cq-q', 'cq-a', 'cq-b', 'cq-c', 'cq-d', 'cq-ans', 'cq-exp',
      'onb-role', 'onb-level', 'onb-date'
    ];
    labelledControls.forEach(id => assert.match(html, new RegExp('<label[^>]+for="' + id + '"'), id + ' needs an explicit label'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
