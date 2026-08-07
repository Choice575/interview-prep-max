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

test('wires diagnostic history and AI retest callbacks into the coach UI', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /function saveCoachAIReview\(/);
  assert.match(app, /function startCoachRetestMode\(/);
  assert.match(app, /saveAiReview:saveCoachAIReview/);
  assert.match(app, /startRetest:startCoachRetestMode/);
  assert.match(app, /normaliseReviewHistoryEntry:IPMaxAICoach\.normaliseReviewHistoryEntry/);
  assert.match(app, /reviewHistoryLimit:IPMaxAICoach\.REVIEW_HISTORY_LIMIT/);
});

test('wires written and optional dictated interview answers into bounded AI history', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /id="ip-answer"[^>]*maxlength="6000"/);
  assert.match(html, /id="ip-ai-evaluate-btn"/);
  assert.match(html, /id="ip-dictate-btn"/);
  assert.match(html, /сервер[^<]*браузер|сервис[^<]*браузер/i);
  assert.match(html, /id="ip-ai-result"[^>]*aria-live="polite"/);
  assert.match(app, /async function evaluateInterviewAnswer\(/);
  assert.match(app, /function saveInterviewAIHistory\(/);
  assert.match(app, /function startInterviewFollowUp\(/);
  assert.match(app, /function submitInterviewFollowUp\(/);
  assert.match(app, /leavingInterview[\s\S]*resetInterviewAIState\(\)/);
  assert.match(app, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(app, /normaliseInterviewHistoryEntry:IPMaxInterviewPracticeUI\.normaliseInterviewHistoryEntry/);
  assert.match(app, /interviewHistoryLimit:IPMaxInterviewPracticeUI\.INTERVIEW_HISTORY_LIMIT/);

  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(styles, /\.ip-answer-panel[,{]/);
  assert.match(styles, /\.ip-privacy-note\{/);
  assert.match(styles, /\.ip-ai-dimensions\{/);
  assert.match(styles, /\.ip-ai-rubric-item\{/);
  assert.match(styles, /\.ip-follow-up-form[,{]/);
  assert.match(styles, /\.ip-follow-up-form\[hidden\]\{display:none/);
  assert.match(styles, /@media\(max-width:560px\).*\.ip-ai-dimensions/s);
});

test('registers AI Tutor modules across the complete no-bundler PWA fan-out', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const eslint = fs.readFileSync(path.join(root, 'eslint.config.mjs'), 'utf8');
  const verifier = fs.readFileSync(path.join(root, 'verify-release.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.ok(html.indexOf('./ai-tutor.js') > html.indexOf('./chapter-ui.js'));
  assert.ok(html.indexOf('./ai-tutor-ui.js') > html.indexOf('./ai-tutor.js'));
  assert.ok(html.indexOf('./ai-tutor-ui.js') < html.indexOf('./app.js'));
  ['./ai-tutor.js', './ai-tutor-ui.js'].forEach(asset => {
    assert.match(sw, new RegExp(asset.replace(/[./-]/g, '\\$&')));
    assert.match(app, new RegExp(asset.replace(/[./-]/g, '\\$&')));
    assert.match(verifier, new RegExp(asset.replace(/[./-]/g, '\\$&')));
  });
  assert.match(serverSource, /'ai-tutor\.js'/);
  assert.match(serverSource, /'ai-tutor-ui\.js'/);
  assert.match(dockerfile, /ai-tutor\.js/);
  assert.match(dockerfile, /ai-tutor-ui\.js/);
  assert.match(eslint, /'ai-tutor\.js'/);
  assert.match(eslint, /'ai-tutor-ui\.js'/);
  assert.match(eslint, /IPMaxAITutor/);
  assert.match(eslint, /IPMaxAITutorUI/);
  assert.match(pkg.scripts.test, /ai-tutor\.test\.js/);
  assert.match(pkg.scripts.test, /ai-tutor-ui\.test\.js/);
});

test('wires context-aware AI Tutor buttons into the course chapter and current study day', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const chapterUi = fs.readFileSync(path.join(root, 'chapter-ui.js'), 'utf8');
  const studyUi = fs.readFileSync(path.join(root, 'study-ui.js'), 'utf8');

  assert.match(app, /function openAITutor\(/);
  assert.match(app, /async function submitAITutor\(/);
  assert.match(app, /function resetAITutorSession\(/);
  assert.match(app, /function setAITutorStyle\(style\)[\s\S]*resetAITutorSession\(false\)/);
  assert.match(app, /AbortController/);
  assert.match(app, /aiTutorRequestId/);
  assert.match(app, /aiTutorContextKey/);
  assert.match(app, /const tutor=requireAITutor\(\)[\s\S]*tutor\.buildTutorPayload/);
  assert.match(app, /requireAITutorUI\(\)\.renderTutorModal/);
  assert.match(app, /data-tutor-open/);
  assert.match(app, /data-tutor-copy-index/);
  assert.match(app, /KeyboardEvent|Escape/);
  assert.match(app, /leavingInterview[\s\S]*resetInterviewAIState/);
  assert.match(chapterUi, /data-tutor-open/);
  assert.match(studyUi, /data-tutor-open/);
  assert.match(app, /renderChapterPage[\s\S]*resolved[\s\S]*openAITutor|openAITutor[\s\S]*chapter/);
  assert.match(app, /renderStudyToday[\s\S]*day[\s\S]*openAITutor|openAITutor[\s\S]*study/);
});

test('styles AI Tutor for accessible touch targets, long output and compact viewports', () => {
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(styles, /\.tutor-open-btn[^{]*\{[^}]*min-height:44px/s);
  assert.match(styles, /\.tutor-modal-head \.btn-icon[^{]*\{[^}]*min-width:44px[^}]*min-height:44px/s);
  assert.match(styles, /\.tutor-modal[^{]*\{[^}]*max-width:[^;}]+[^}]*max-height:[^;}]+[^}]*overflow-y:auto/s);
  assert.match(styles, /#ai-tutor-practice-wrap\[hidden\]\{display:none/);
  assert.match(styles, /\.tutor-modal textarea[^{]*\{[^}]*width:100%[^}]*min-width:0/s);
  assert.match(styles, /\.tutor-code pre[^{]*\{[^}]*overflow-x:auto[^}]*max-width:100%/s);
  assert.match(styles, /\.tutor-(?:summary|section|block)[^{]*\{[^}]*overflow-wrap:anywhere/s);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.tutor-modal[^{]*\{[^}]*width:100%[^}]*max-height:100/s);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.tutor-mode-tabs[^{]*\{[^}]*flex-wrap:wrap/s);
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
    assert.ok(html.indexOf('./chapter-ui.js') < html.indexOf('./router.js'));
    assert.ok(html.indexOf('./router.js') < html.indexOf('./interview-practice-ui.js'));
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
