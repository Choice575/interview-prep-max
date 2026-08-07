const { test, expect } = require('@playwright/test');

const profile = { role: 'SRE', level: 'Middle', date: '', completedAt: '2026-07-21T00:00:00.000Z' };

async function setProgress(page, values) {
  await page.addInitScript(data => {
    if (sessionStorage.getItem('ipmax_e2e_seeded') === 'true') return;
    sessionStorage.setItem('ipmax_e2e_seeded', 'true');
    localStorage.clear();
    Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }, values);
}

async function installManualClock(page) {
  await page.addInitScript(() => {
    window.__testNow = Date.now();
    Date.now = () => window.__testNow;
    window.__advanceNow = milliseconds => { window.__testNow += milliseconds; };
  });
}

test('builds a focused session from onboarding', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('#onboarding-modal')).toHaveClass(/open/);
  await page.locator('#onb-role').selectOption('SRE');
  await page.locator('#onb-level').selectOption('Middle');
  await page.locator('#onboarding-modal .btn-primary').click();
  await expect(page.locator('#daily-plan-card')).toBeVisible();
  await expect(page.locator('.coach-role')).toContainText('SRE');
  await page.locator('#daily-plan-content .btn-primary').click();
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
  await expect(page.locator('#questions-container .q-card').first()).toBeVisible();
});

test('renders the extracted home UI and routes its actions', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');

  await expect(page.locator('#mastery-cards .mastery-card')).toHaveCount(9);
  await expect(page.locator('#blitz-btn')).toBeVisible();
  expect(await page.locator('.quick-actions [onclick]').count()).toBe(0);

  // Карточки тем свёрнуты: первый экран отдан действию на сегодня.
  // Раскрываем блок, иначе они есть в DOM, но кликнуть по ним нельзя.
  await page.locator('#home-topics-more > summary').click();
  const firstCard = page.locator('#mastery-cards .mastery-card').first();
  const topic = await firstCard.locator('.mastery-name').textContent();
  await firstCard.click();
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
  await expect(page.locator('#questions-container .q-card .q-meta .tag').first()).toHaveText(topic);

  await page.locator('[data-page="home"]').click();
  await page.locator('.quick-actions [data-home-value="mix10"]').click();
  await expect(page.locator('#questions-container .q-card')).toHaveCount(10);
});

test('opens only due repetitions from the coach plan', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_qprog: { 1: { correct: 0, wrong: 1, nextReviewAt: Date.now() - 1 } }
  });
  await page.goto('/');
  await page.locator('[data-coach-action="start-review"]').click();
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
  await expect(page.locator('#questions-container .q-card')).toHaveCount(1);
});

test('shows a weekly review and starts an adaptive control session', async ({ page }) => {
  const now = Date.now();
  await setProgress(page, {
    ipmax_onboarding: { ...profile, date: new Date(now + 5 * 86400000).toISOString().slice(0, 10) },
    ipmax_onboarding_complete: true,
    ipmax_skill_events: [
      { source: 'exam', topic: 'Linux', skill: 'Linux', score: 0, possible: 1, at: now - 86400000 },
      { source: 'exam', topic: 'Terraform', skill: 'Terraform', score: 1, possible: 1, at: now - 2 * 86400000 }
    ]
  });
  await page.goto('/');
  await expect(page.locator('.coach-review')).toBeVisible();
  await expect(page.locator('.coach-status')).toContainText('Нужна коррекция');
  await page.getByRole('button', { name: /Контрольная/ }).click();
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
  const count = await page.locator('#questions-container .q-card').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(15);
});

test('stores and removes a skill-journal note', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.getByRole('button', { name: /Журнал навыков/ }).click();
  await expect(page.locator('#coach-journal-modal')).toHaveClass(/open/);
  await page.locator('#coach-journal-topic').selectOption('Linux');
  await page.locator('#coach-journal-note').fill('Повторить порядок диагностики DNS');
  await page.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect(page.locator('.coach-journal-item')).toContainText('Повторить порядок диагностики DNS');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_coach_journal')).length)).toBe(1);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Удалить заметку' }).click();
  await expect(page.locator('.coach-journal-empty')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_coach_journal')).length)).toBe(0);
});

test('sends bounded diagnostic evidence, stores history and starts a trusted retest', async ({ page }) => {
  let reviewRequest = null;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/ai/review')) reviewRequest = request;
  });
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_sync_token: 'e2e-sync-token-at-least-24-characters',
    ipmax_coach_control: {
      id: 'control-e2e', startedAt: Date.now() - 60000, completedAt: null,
      questionIds: ['1', '2', '3'], topics: ['Terraform'],
      attempts: [
        { questionId: '1', topic: 'Terraform', score: 0, selectedAnswerIndex: 1, responseSeconds: 74, at: Date.now() - 30000 },
        { questionId: '2', topic: 'Terraform', score: 1, selectedAnswerIndex: 1, responseSeconds: 20, at: Date.now() - 20000 }
      ]
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: /AI-разбор/ }).click();
  await expect(page.locator('#coach-ai-modal')).toHaveClass(/open/);
  await expect(page.locator('.coach-ai-badge')).toHaveText('Внешний AI');
  await expect(page.locator('.coach-ai-summary')).toContainText('AI-разбор готов');
  await expect(page.locator('.coach-ai-diagnosis')).toContainText('Terraform');
  await expect(page.locator('.coach-ai-weekly')).toContainText('Динамика за 7 дней');
  await expect(page.locator('.coach-ai-history-item')).toHaveCount(1);

  expect(reviewRequest).not.toBeNull();
  expect(reviewRequest.headers().authorization).toMatch(/^Bearer .{24,}$/);
  const payload = reviewRequest.postDataJSON();
  expect(payload.schemaVersion).toBe(2);
  expect(payload.control.questionDetails).toHaveLength(1);
  expect(payload.control.questionDetails[0].selectedAnswer).toBe('Система управления конфигурацией операционных систем');
  expect(payload.control.questionDetails[0].correctAnswer).toBe('Декларативный инструмент Infrastructure as Code');

  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_ai_review_history')));
  expect(history).toHaveLength(1);
  expect(JSON.stringify(history)).not.toContain('questionDetails');

  await page.getByRole('button', { name: 'Запустить повторную контрольную' }).click();
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
  const cards = page.locator('#questions-container .q-card');
  const ids = await cards.evaluateAll(items => items.map(item => item.id));
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.length).toBeLessThanOrEqual(20);
  expect(new Set(ids).size).toBe(ids.length);
  await expect(cards.first().locator('.q-meta')).toContainText('Terraform');
});

test('evaluates a written interview answer, stores compact history and bounds one follow-up', async ({ page }) => {
  const requests = [];
  await page.addInitScript(() => {
    try { delete window.SpeechRecognition; } catch (_) {}
    try { delete window.webkitSpeechRecognition; } catch (_) {}
  });
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/ai/interview')) requests.push(request);
  });
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_sync_token: 'e2e-sync-token-at-least-24-characters'
  });
  await page.goto('/');
  await page.locator('[data-page="interview"]').click();
  await expect(page.locator('#page-interview')).toHaveClass(/active/);
  await expect(page.locator('#ip-dictate-btn')).toBeDisabled();
  await expect(page.locator('#ip-dictation-status')).toContainText('используйте печать');

  const written = 'Ситуация: выпуск сломался. Действия: остановил ущерб и откатил версионный образ. Результат: восстановил сервис за 10 минут и добавил проверку.';
  await page.locator('#ip-answer').fill(written);
  await page.locator('#ip-ai-evaluate-btn').click();
  await expect(page.locator('.ip-ai-evaluation')).toBeVisible();
  await expect(page.locator('.ip-ai-source')).toHaveText('Тестовый AI');
  await expect(page.locator('.ip-ai-dimension')).toHaveCount(4);
  await expect(page.locator('.ip-ai-rubric-item')).toHaveCount(4);

  expect(requests).toHaveLength(1);
  expect(requests[0].headers().authorization).toMatch(/^Bearer .{24,}$/);
  const firstPayload = requests[0].postDataJSON();
  expect(firstPayload.answer).toBe(written);
  expect(firstPayload.followUp).toBeUndefined();
  expect(firstPayload.messages).toBeUndefined();

  const firstHistory = await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_interview_ai_history')));
  expect(firstHistory).toHaveLength(1);
  const compact = JSON.stringify(firstHistory);
  expect(compact).not.toContain(written);
  expect(compact).not.toContain('evidence');
  expect(compact).not.toContain('improvedAnswer');

  await page.getByRole('button', { name: 'Ответить на уточнение' }).first().click();
  await expect(page.locator('#ip-follow-up-form')).toBeVisible();
  await expect(page.locator('#ip-follow-up-turn')).toContainText('1 из 3');
  await page.locator('#ip-follow-up-answer').fill('Результат измерил по времени восстановления и числу повторных сбоев.');
  await page.getByRole('button', { name: 'Отправить уточнение' }).click();
  await expect.poll(() => requests.length).toBe(2);
  const followPayload = requests[1].postDataJSON();
  expect(followPayload.followUpTurn).toBe(1);
  expect(followPayload.followUp.question.length).toBeGreaterThan(0);
  expect(followPayload.followUp.answer).toContain('времени восстановления');
  expect(followPayload.messages).toBeUndefined();
  await expect(page.locator('#ip-follow-up-form')).toBeHidden();
});

test('does not render or save an AI evaluation after switching interview tasks', async ({ page }) => {
  let releaseResponse;
  const responseGate = new Promise(resolve => { releaseResponse = resolve; });
  await page.route('**/api/ai/interview', async route => {
    await responseGate;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ evaluation: {
        source: 'mock', overallScore: 70, summary: 'Устаревший результат',
        dimensions: {
          correctness: { score: 70, feedback: '' }, completeness: { score: 70, feedback: '' },
          structure: { score: 70, feedback: '' }, tradeoffs: { score: 70, feedback: '' }
        },
        rubric: [], gaps: [], improvedAnswer: '', followUps: [], caution: ''
      } })
    });
  });
  await setProgress(page, {
    ipmax_onboarding: profile, ipmax_onboarding_complete: true,
    ipmax_sync_token: 'e2e-sync-token-at-least-24-characters'
  });
  await page.goto('/');
  await page.locator('[data-page="interview"]').click();
  await page.locator('#ip-answer').fill('Ответ на первое задание');
  await page.locator('#ip-ai-evaluate-btn').click();
  await expect(page.locator('#ip-ai-result')).toContainText('оценивает ответ');
  await page.locator('#ip-list [data-ip-id]').nth(1).click();
  releaseResponse();

  await expect(page.locator('#ip-answer')).toHaveValue('');
  await expect(page.locator('#ip-ai-result')).not.toContainText('Устаревший результат');
  await expect(page.locator('#ip-ai-evaluate-btn')).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_interview_ai_history') || '[]'))).toHaveLength(0);
});

test('does not save a delayed interview evaluation after leaving the page', async ({ page }) => {
  let releaseResponse;
  const responseGate = new Promise(resolve => { releaseResponse = resolve; });
  await page.route('**/api/ai/interview', async route => {
    await responseGate;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ evaluation: {
        source: 'mock', overallScore: 70, summary: 'Результат покинутой страницы',
        dimensions: {
          correctness: { score: 70, feedback: '' }, completeness: { score: 70, feedback: '' },
          structure: { score: 70, feedback: '' }, tradeoffs: { score: 70, feedback: '' }
        }, rubric: [], gaps: [], improvedAnswer: '', followUps: [], caution: ''
      } })
    });
  });
  await setProgress(page, {
    ipmax_onboarding: profile, ipmax_onboarding_complete: true,
    ipmax_sync_token: 'e2e-sync-token-at-least-24-characters'
  });
  await page.goto('/');
  await page.locator('[data-page="interview"]').click();
  await page.locator('#ip-answer').fill('Ответ перед уходом со страницы');
  await page.locator('#ip-ai-evaluate-btn').click();
  await expect(page.locator('#ip-ai-result')).toContainText('оценивает ответ');
  await page.locator('[data-page="home"]').click();
  releaseResponse();

  await expect(page.locator('#page-home')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_interview_ai_history') || '[]').length)).toBe(0);
});

test('dictation is opt-in, appends recognised text and stops when the task changes', async ({ page }) => {
  await page.addInitScript(() => {
    window.__recognitionStarts = 0;
    window.__recognitionStops = 0;
    class FakeRecognition {
      start() {
        window.__recognitionStarts++;
        if (this.onstart) this.onstart();
        setTimeout(() => {
          if (this.onresult) this.onresult({ results: [[{ transcript: 'распознанный фрагмент' }]] });
        }, 20);
      }
      stop() {
        window.__recognitionStops++;
        if (this.onend) this.onend();
      }
    }
    window.SpeechRecognition = FakeRecognition;
  });
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.locator('[data-page="interview"]').click();
  expect(await page.evaluate(() => window.__recognitionStarts)).toBe(0);
  await expect(page.locator('#ip-dictate-btn')).toBeEnabled();
  await page.locator('#ip-dictate-btn').click();
  await expect(page.locator('#ip-answer')).toHaveValue(/распознанный фрагмент/);
  expect(await page.evaluate(() => window.__recognitionStarts)).toBe(1);

  await page.locator('#ip-list [data-ip-id]').nth(1).click();
  expect(await page.evaluate(() => window.__recognitionStops)).toBe(1);
  await expect(page.locator('#ip-answer')).toHaveValue('');
});

test('ignores a late dictation result after switching interview tasks', async ({ page }) => {
  await page.addInitScript(() => {
    class LateRecognition {
      start() {
        if (this.onstart) this.onstart();
        setTimeout(() => {
          if (this.onresult) this.onresult({ results: [[{ transcript: 'ПОЗДНИЙ ФРАГМЕНТ' }]] });
          if (this.onend) this.onend();
        }, 120);
      }
      stop() { /* Браузер вправе ещё доставить финальный result после stop(). */ }
    }
    window.SpeechRecognition = LateRecognition;
  });
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.locator('[data-page="interview"]').click();
  await page.locator('#ip-dictate-btn').click();
  await page.locator('#ip-list [data-ip-id]').nth(1).click();

  await page.waitForTimeout(180);
  await expect(page.locator('#ip-answer')).toHaveValue('');
  await expect(page.locator('#ip-dictate-btn')).toContainText('Начать диктовку');
  await expect(page.locator('#ip-dictation-status')).not.toContainText('Слушаю');
});

test('keeps written interview practice usable on a compact viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.locator('#menu-toggle').click();
  await page.locator('[data-page="interview"]').click();
  await expect(page.locator('#ip-answer')).toBeVisible();
  await expect(page.locator('#ip-ai-evaluate-btn')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('records a Mock Interview rating in the skill-event journal', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await expect(page.locator('#mock-btn')).toBeVisible();
  await page.locator('#mock-btn').click();
  await expect(page.locator('#mock-inp')).toBeVisible();
  await page.locator('.mock-rate-btn').nth(3).click();
  await page.locator('#mock-next-btn').click();
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_skill_events')));
  expect(events.some(event => event.source === 'mock' && event.score === 1)).toBeTruthy();
});

test('keeps focus inside dialogs and restores it after Escape', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');

  const trigger = page.locator('[data-modal-trigger="custom-modal"]');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '➕ Добавить свой вопрос' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#cq-topic')).toBeFocused();

  await dialog.getByRole('button', { name: 'Сохранить' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#cq-topic')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('uses wall-clock deadlines for Blitz and Mock Interview', async ({ page }) => {
  await installManualClock(page);
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');

  await page.locator('#blitz-btn').click();
  await expect(page.locator('#blitz-timer')).toHaveText('5:00');
  await page.evaluate(() => window.__advanceNow(240000));
  await expect(page.locator('#blitz-timer')).toHaveText('1:00', { timeout: 2000 });

  await page.locator('[data-page="home"]').click();
  await page.locator('#mock-btn').click();
  await expect(page.locator('#mock-timer')).toHaveText('30:00');
  await page.evaluate(() => window.__advanceNow(125000));
  await expect(page.locator('#questions-container')).toContainText('Вопрос 2/12', { timeout: 2000 });
  await expect(page.locator('#mock-timer')).toHaveText('27:55');
});

test('imports a validated personal profile through the file control', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#import-inp').setInputFiles({
    name: 'progress.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: '12.4.0', onboarding: { ...profile, role: 'Cloud' }, onboarding_complete: true, skill_events: [] }))
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_onboarding')).role)).toBe('Cloud');
  await expect(page.locator('.coach-role')).toContainText('Cloud Engineer');
});

test('exports a versioned progress backup through the extracted module', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_qprog: { 1: { correct: 2, wrong: 1 } }
  });
  await page.goto('/');
  page.once('dialog', dialog => dialog.dismiss());
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Копировать прогресс' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  expect(download.suggestedFilename()).toMatch(/^ipmax_\d{4}-\d{2}-\d{2}\.json$/);
  // Сверяем с version.js, а не с константой: иначе каждый релиз ломает тест,
  // который проверяет экспорт прогресса, а не номер версии.
  expect(backup.version).toBe(
    require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'version.js'), 'utf8')
      .match(/self\.IPMAX_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/)[1]
  );
  expect(backup.qprog['1']).toEqual({ correct: 2, wrong: 1 });
  expect(backup.onboarding.role).toBe(profile.role);
});

test('rejects malformed progress without replacing existing data', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_qprog: { 1: { correct: 1, wrong: 0 } }
  });
  await page.goto('/');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#import-inp').setInputFiles({
    name: 'broken-progress.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: '12.4.0', qprog: { 1: { correct: 'many', wrong: 0 } } }))
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog'))['1'].correct)).toBe(1);
});

test('rolls back all imported fields when browser storage rejects a write', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_qprog: { 1: { correct: 1, wrong: 0 } },
    ipmax_history: [{ date: '21.07.2026', topic: 'Linux', correct: true }]
  });
  await page.goto('/');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let rejected = false;
    Storage.prototype.setItem = function(key, value) {
      if (!rejected && key === 'ipmax_history') {
        rejected = true;
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  const message = new Promise(resolve => page.once('dialog', dialog => {
    resolve(dialog.message());
    dialog.dismiss();
  }));
  await page.locator('#import-inp').setInputFiles({
    name: 'too-large-progress.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: '12.4.0',
      qprog: { 1: { correct: 99, wrong: 0 } },
      history: [{ date: '22.07.2026', topic: 'Cloud', correct: false }]
    }))
  });
  expect(await message).toContain('Прежний прогресс восстановлен');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog'))['1'].correct)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_history'))[0].topic)).toBe('Linux');
});

test('does not execute imported question data as an inline handler', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#import-inp').setInputFiles({
    name: 'custom-progress.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: '12.4.0',
      stats: { total: 1, correct: 1 },
      custom: [{
        id: 900001,
        topic: "Ops';window.__importXss=true;//",
        level: 'Middle',
        q: 'Безопасный пользовательский вопрос',
        options: ['Да', 'Нет'],
        answer: 0,
        category: 'definition'
      }]
    }))
  });
  await page.locator('[data-page="analytics"]').click();
  const recommendation = page.locator('[data-next-question]').filter({ hasText: 'Безопасный пользовательский вопрос' });
  await expect(recommendation).toBeVisible();
  await expect(recommendation).not.toHaveAttribute('onclick', /./);
  await recommendation.click();
  expect(await page.evaluate(() => window.__importXss)).toBeUndefined();
  await expect(page.locator('#questions-container .q-card')).toHaveCount(1);
});

test('opens exactly the questions shown in analytics recommendations', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_stats: { total: 1, correct: 0 },
    ipmax_qprog: { 1: { correct: 0, wrong: 1 } }
  });
  await page.goto('/');
  await page.locator('[data-page="analytics"]').click();
  await expect(page.locator('#grade-readiness-card')).toBeVisible();
  const recommendations = page.locator('[data-next-question]');
  await expect(recommendations).toHaveCount(10);
  const expectedIds = (await recommendations.evaluateAll(buttons => buttons.map(button => button.dataset.questionId))).sort();

  await page.locator('[data-analytics-action="start-recommended"]').click();
  await expect(page.locator('#questions-container .q-card')).toHaveCount(10);
  const actualIds = (await page.locator('#questions-container .q-card').evaluateAll(cards => cards.map(card => card.id.replace('qcard-', '')))).sort();
  expect(actualIds).toEqual(expectedIds);
});

test('defers exam cards and renders the full list in batches', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await expect(page.locator('#questions-container .q-card')).toHaveCount(0);
  await page.locator('[data-page="exam"]').click();
  await expect(page.locator('#questions-container .q-card')).toHaveCount(60);
  await expect(page.locator('#questions-load-more')).toContainText('60/818');
  await page.locator('#questions-load-more button').click();
  await expect(page.locator('#questions-container .q-card')).toHaveCount(120);
});

test('routes exam answers and keyboard flashcards through the extracted UI module', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.locator('[data-page="exam"]').click();

  const firstCard = page.locator('#questions-container .q-card').first();
  await expect(firstCard).toBeVisible();
  expect(await firstCard.locator('[onclick]').count()).toBe(0);
  const correctIndex = await firstCard.locator('.q-opt').first().getAttribute('data-answer');
  await firstCard.locator(`.q-opt[data-orig-idx="${correctIndex}"]`).click();
  await expect(firstCard).toHaveClass(/correct/);
  await expect(page.locator('#progress-info')).toContainText('✅ 1');

  await page.getByRole('button', { name: 'Карточки', exact: true }).click();
  const flashcard = page.locator('.flashcard').first();
  await flashcard.focus();
  await flashcard.press('Enter');
  await expect(flashcard).toHaveClass(/flipped/);
});

test('offers a bound recovery action when there are no mistakes', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.locator('[data-page="exam"]').click();
  await page.getByRole('button', { name: 'Ошибки', exact: true }).click();

  const recovery = page.getByRole('button', { name: 'Показать все вопросы' });
  await expect(recovery).toBeVisible();
  expect(await recovery.getAttribute('onclick')).toBeNull();
  await recovery.click();
  await expect(page.locator('#questions-container .q-card')).toHaveCount(60);
  await expect(page.locator('#mode-chips .chip').first()).toHaveClass(/active/);
});

test('keeps the focused daily plan usable on a compact viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await expect(page.locator('#daily-plan-card')).toBeVisible();
  await expect(page.locator('#daily-plan-content .btn-primary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('shows Best Practices for every topic and opens the related trainer', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.locator('[data-page="practices"]').click();
  await expect(page.locator('#page-practices')).toHaveClass(/active/);
  await expect(page.getByRole('tab')).toHaveCount(13);
  await expect(page.locator('.practice-card')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  await page.getByRole('tab', { name: 'Kubernetes' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Kubernetes');
  await expect(page.locator('.practice-card')).toHaveCount(5);
  await page.locator('#practice-trainer').click();
  await expect(page.locator('#page-k8s')).toHaveClass(/active/);
  await expect(page.locator('#k8s-container .code-card').first()).toBeVisible();
});

test('keeps Best Practices usable on a compact viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.locator('#menu-toggle').click();
  await page.locator('[data-page="practices"]').click();
  await expect(page.locator('.practice-card').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Linux' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Linux');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('loads the app shell after the network goes offline', async ({ page, context }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#daily-plan-card')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('preserves study progress while migrating an older curriculum profile', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_storage_schema: 1,
    ipmax_curriculum_version: '5.0.0',
    ipmax_study_position: { week: 3, day: 1 },
    ipmax_study_progress: { w3d1: 'done', w3d2: 'review' },
  });
  await page.goto('/');
  await page.locator('[data-page="study"]').click();

  await expect(page.locator('#study-current')).toContainText('Неделя 3');
  await expect(page.locator('#study-progress .study-status.done')).toHaveText('готово');
  await expect(page.locator('#study-progress .study-status.review')).toHaveText('повторить');
  const migration = await page.evaluate(() => ({
    schema: JSON.parse(localStorage.getItem('ipmax_storage_schema')),
    curriculum: JSON.parse(localStorage.getItem('ipmax_curriculum_version')),
    progress: JSON.parse(localStorage.getItem('ipmax_study_progress')),
    backup: JSON.parse(localStorage.getItem('ipmax_progress_backup')),
  }));
  expect(migration.schema).toBe(2);
  expect(migration.curriculum).toBe('5.1.0');
  expect(migration.progress).toEqual({ w3d1: 'done', w3d2: 'review' });
  expect(migration.backup.fromCurriculumVersion).toBe('5.0.0');
});

test('navigates the complete roadmap through the selector and week map', async ({ page }) => {
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await page.locator('[data-page="study"]').click();

  await expect(page.locator('[data-study-week-select] option')).toHaveCount(32);
  await page.locator('[data-study-week-select]').selectOption('9');
  await expect(page.locator('[data-study-week-select]')).toHaveValue('9');
  await expect(page.locator('#study-test .study-question')).toHaveCount(5);

  await page.locator('.study-week-map summary').click();
  await page.locator('[data-study-week="10"]').click();
  await expect(page.locator('[data-study-week-select]')).toHaveValue('10');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_study_position')).week)).toBe(10);
});

test('switches to the MLOps curriculum and keeps its progress separate', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    // Позиция в DevOps-плане должна дожить до возврата: ключи прогресса у
    // программ разные, и переключение не имеет права их склеить.
    ipmax_study_position: { week: 7, day: 2 },
  });
  await page.goto('/');
  await page.locator('[data-page="study"]').click();

  await expect(page.locator('[data-study-week-select] option')).toHaveCount(32);
  await expect(page.locator('.study-overview-kicker')).toContainText('32 недель');

  await page.locator('[data-study-program="mlops"]').click();

  // Вторая программа короче и живёт в собственном ключе позиции.
  await expect(page.locator('[data-study-week-select] option')).toHaveCount(24);
  await expect(page.locator('.study-overview-kicker')).toContainText('MLOps · 24 недель');
  await expect(page.locator('[data-study-program="mlops"]')).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ipmax_study_program'))).toBe('"mlops"');

  // Детализированная неделя показывает пять дней, как в основном плане.
  await expect(page.locator('#study-days .study-day')).toHaveCount(5);

  // Мини-тест берётся из mlops_tests.json, а не из набора DevOps: неделя 1 дня 1
  // покрыта, поэтому вопросы должны отрисоваться.
  await expect(page.locator('#study-test .study-question')).toHaveCount(5);
  await expect(page.locator('#study-test h3')).toContainText('Изолированное окружение Python');

  // Навигация внутри второй программы работает так же, как в основном плане.
  // Состояние «неделя без дней» намеренно не проверяется здесь: это переходное
  // состояние данных, а рендер заглушки закрыт unit-тестами study-ui.
  await page.locator('[data-study-week-select]').selectOption('13');
  await expect(page.locator('[data-study-week-select]')).toHaveValue('13');
  await expect(page.locator('#study-days .study-day')).toHaveCount(5);
  await expect(page.locator('#study-week-outcome .study-criterion')).not.toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_mlops_position')).week)).toBe(13);

  // Недельный тест второй программы берётся из mlops_tests.json и обязан
  // отрисовать все четыре части. Схема совпадает с devops, но совпадение схемы
  // не доказывает рендер: пятничный тест MLOps проверяется здесь фактически.
  await page.locator('[data-study-week-select]').selectOption('1');
  await page.locator('#study-days .study-day').nth(4).click();
  const mlopsWeekly = page.locator('.study-weekly-test');
  await expect(mlopsWeekly).toBeVisible();
  await expect(mlopsWeekly.locator('h3')).toContainText('Python-проект для ML');
  // Практика, теория, debug и Senior Challenge — по одной самооценке на часть.
  await expect(mlopsWeekly.locator('input[type="number"]')).toHaveCount(4);
  await expect(mlopsWeekly.locator('.study-weekly-part')).toHaveCount(4);
  await expect(mlopsWeekly.locator('.study-weekly-question')).not.toHaveCount(0);
  await expect(mlopsWeekly).toContainText('Кейс: mlops-env-001');

  // Возврат в DevOps: позиция сохранилась, MLOps не затёр её.
  await page.locator('[data-study-program="devops"]').click();
  await expect(page.locator('[data-study-week-select]')).toHaveValue('7');
  await expect(page.locator('[data-study-week-select] option')).toHaveCount(32);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_study_position')).week)).toBe(7);
});

test('completes a study week, unlocks the next one and restores it after reload', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_study_position: { week: 1, day: 5 },
    ipmax_study_progress: {
      w1d1: 'done', w1d2: 'done', w1d3: 'done', w1d4: 'done',
      w1criteria: [true, true, true, true],
    },
  });
  await page.goto('/');
  await page.locator('[data-page="study"]').click();

  await expect(page.locator('#study-overview')).toBeVisible();
  await expect(page.locator('#study-overview [role="progressbar"]')).toHaveAttribute('aria-valuenow', '3');
  const miniAnswers = page.locator('#study-test > .study-card').first().locator('.study-answer');
  await expect(miniAnswers).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) await miniAnswers.nth(index).fill(`Evidence ${index + 1}`);
  for (let index = 0; index < 5; index += 1) {
    await page.locator('#study-test > .study-card').first().locator('.study-question').nth(index).locator('.study-score-row .btn-primary').click();
  }
  await expect(page.locator('#study-overview [role="progressbar"]')).toHaveAttribute('aria-valuenow', '3');

  const weekly = page.locator('.study-weekly-test');
  await expect(weekly).toBeVisible();
  const weeklyAnswers = weekly.locator('textarea');
  for (let index = 0; index < await weeklyAnswers.count(); index += 1) {
    await weeklyAnswers.nth(index).fill(`Проверяемое evidence ${index + 1}`);
  }
  const scores = weekly.locator('input[type="number"]');
  await expect(scores).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await scores.nth(index).fill(await scores.nth(index).getAttribute('max'));
  }
  const gates = weekly.locator('.study-weekly-gates input[type="checkbox"]');
  for (let index = 0; index < await gates.count(); index += 1) await gates.nth(index).check();
  page.once('dialog', dialog => dialog.accept());
  await weekly.locator('.study-actions .btn-primary').click();

  await expect(page.locator('.study-weekly-state')).toHaveClass(/passed/);
  await expect(page.locator('.study-week-map-item[data-study-week="1"]')).toHaveClass(/is-complete/);
  const persisted = await page.evaluate(() => ({
    result: JSON.parse(localStorage.getItem('ipmax_study_weekly_results'))['weekly-w1-linux-permissions'],
    progress: JSON.parse(localStorage.getItem('ipmax_study_progress')),
  }));
  expect(persisted.result.passed).toBe(true);
  expect(persisted.result.bestScore).toBe(100);
  expect(persisted.progress.w2d1).toBe('todo');

  await page.locator('.study-overview-continue').click();
  await expect(page.locator('[data-study-week-select]')).toHaveValue('2');
  await page.reload();
  await page.locator('[data-page="study"]').click();
  await expect(page.locator('[data-study-week-select]')).toHaveValue('2');
  await expect(page.locator('.study-week-map-item[data-study-week="1"]')).toHaveClass(/is-complete/);
});

test('keeps study progress and recommendations accessible on a compact viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_study_position: { week: 1, day: 2 },
    ipmax_study_progress: { w1d1: 'done', w1d2: 'review' },
    ipmax_study_answers: { 'mini-w1d1-linux-paths': { score: 2, qScores: [1, 1, 0, 0, 0] } },
  });
  await page.goto('/');
  await page.locator('#menu-toggle').click();
  await page.locator('[data-page="study"]').click();

  await expect(page.getByRole('heading', { name: 'Общий прогресс курса' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Прогресс учебного курса' })).toBeVisible();
  await expect(page.locator('.study-recommendation').first()).toBeVisible();
  await page.locator('.study-overview-continue').focus();
  await expect(page.locator('.study-overview-continue')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  await page.locator('.study-week-map summary').click();
  await expect(page.locator('.study-week-map-item')).toHaveCount(32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('opens the AI Tutor from a course chapter, sends bounded context and ignores a late response after Escape', async ({ page }) => {
  const requests = [];
  let requestNumber = 0;
  let releaseLateResponse;
  const lateResponseGate = new Promise(resolve => { releaseLateResponse = resolve; });
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_sync_token: 'e2e-sync-token-at-least-24-characters',
    ipmax_chapter_position: { slug: 'git', chapterId: 'ch_git_w4d1' },
  });
  await page.route('**/api/ai/tutor', async route => {
    requestNumber += 1;
    requests.push(route.request());
    if (requestNumber === 2) await lateResponseGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tutor: {
        source: 'mock', mode: 'explain', title: requestNumber === 1 ? 'Git: рабочая директория и индекс' : 'ПОЗДНИЙ ОТВЕТ',
        summary: 'Git хранит изменения по этапам, поэтому status, diff и индекс нужно различать.',
        sections: [{ title: 'Основная идея', text: 'Рабочая директория содержит текущие файлы, индекс — следующий снимок.' }],
        example: { description: 'Проверка состояния', code: 'git status' },
        checkQuestion: { question: 'Что попадёт в следующий commit?' },
        nextActions: [{ action: 'Выполнить git status', successCriterion: 'Понятно состояние каждого файла' }],
        caution: 'Проверяйте diff перед commit.'
      } })
    });
  });

  await page.goto('/#/chapter/git/ch_git_w4d1');
  await expect(page.locator('#page-chapter')).toHaveClass(/active/);
  const trigger = page.locator('#chapter-host [data-tutor-open="course"]');
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await trigger.click();
  await expect(page.locator('#ai-tutor-modal')).toHaveClass(/open/);
  await expect(page.locator('#ai-tutor-context-label')).toContainText('Git basics');
  await page.locator('#ai-tutor-question').fill('Объясни разницу между рабочей директорией и индексом');
  await page.locator('#ai-tutor-modal [data-tutor-action="submit"]').click();
  await expect(page.locator('#ai-tutor-result')).toContainText('Git: рабочая директория и индекс');

  expect(requests).toHaveLength(1);
  expect(requests[0].headers().authorization).toBe('Bearer e2e-sync-token-at-least-24-characters');
  const body = requests[0].postDataJSON();
  expect(body.source).toBe('course');
  expect(body.context.key).toBe('course:git:ch_git_w4d1');
  expect(body.context.chapterId).toBe('ch_git_w4d1');
  expect(body.context.courseTitle).toContain('Git');
  expect(body.context.practice.length).toBeLessThanOrEqual(10);
  expect(JSON.stringify(body)).not.toContain('sync-token');
  expect(JSON.stringify(body)).not.toContain('localStorage');

  await page.locator('#ai-tutor-question').fill('Дай второй ответ');
  await page.locator('#ai-tutor-modal [data-tutor-action="submit"]').click();
  await expect.poll(() => requests.length).toBe(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ai-tutor-modal')).not.toHaveClass(/open/);
  releaseLateResponse();
  await page.waitForTimeout(100);
  await expect(page.locator('#ai-tutor-result')).not.toContainText('ПОЗДНИЙ ОТВЕТ');
  await expect(trigger).toBeFocused();

  await page.locator('[data-chapter-open="ch_git_w4d1_test"]').click();
  await expect(page.locator('#chapter-host')).toContainText('Проверка: Git basics');
  await page.locator('#chapter-host [data-tutor-open="course"]').click();
  await page.locator('#ai-tutor-modal [data-tutor-action="submit"]').click();
  await expect.poll(() => requests.length).toBe(3);
  const miniBody = requests[2].postDataJSON();
  expect(miniBody.context.key).toBe('course:git:ch_git_w4d1_test');
  expect(miniBody.context.kind).toBe('mini');
  expect(miniBody.context.materials).toContain('Что показывает git status?');
  expect(miniBody.context.materials).toContain('Что попадает в commit после git add?');
  expect(JSON.stringify(miniBody.context)).not.toMatch(/"expected"\s*:|"answer"\s*:/);
});

test('uses explain, Socratic and practice Tutor modes for the current study day on mobile', async ({ page }) => {
  const requests = [];
  await page.setViewportSize({ width: 390, height: 844 });
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/ai/tutor')) requests.push(request);
  });
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_sync_token: 'e2e-sync-token-at-least-24-characters',
    ipmax_study_position: { week: 1, day: 2 },
  });

  await page.goto('/');
  await page.locator('#menu-toggle').click();
  await page.locator('[data-page="study"]').click();
  await expect(page.locator('#page-study')).toHaveClass(/active/);
  const trigger = page.locator('#study-today [data-tutor-open="study"]');
  await expect(trigger).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox.height).toBeGreaterThanOrEqual(44);
  await trigger.click();

  const modal = page.locator('#ai-tutor-modal');
  await expect(modal).toHaveClass(/open/);
  await expect(page.locator('#ai-tutor-context-label')).toContainText('Файлы, директории, копирование');
  const modalBox = await page.locator('.tutor-modal').boundingBox();
  expect(modalBox.x).toBeGreaterThanOrEqual(0);
  expect(modalBox.width).toBeLessThanOrEqual(390);
  expect(modalBox.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  await page.locator('#ai-tutor-question').fill('Объясни текущую тему простыми словами');
  await page.locator('[data-tutor-style="technical"]').click();
  await page.locator('#ai-tutor-modal [data-tutor-action="submit"]').click();
  await expect(page.locator('#ai-tutor-result')).toContainText('Тестовый AI-учитель');
  await expect(page.locator('#ai-tutor-result')).toContainText('Локальный разбор');

  await page.locator('[data-tutor-mode="socratic"]').click();
  await page.locator('#ai-tutor-modal [data-tutor-action="submit"]').click();
  await expect(page.locator('.tutor-next-question')).toBeVisible();
  await page.locator('[data-tutor-socratic-answer]').fill('Сначала проверю текущее состояние и ожидаемый результат.');
  await page.locator('[data-tutor-action="submit-socratic"]').click();
  await expect(page.locator('.tutor-turn')).toContainText('Ход 2 из 5');

  await page.locator('[data-tutor-mode="practice"]').click();
  await expect(page.locator('#ai-tutor-practice-wrap')).toBeVisible();
  await page.locator('#ai-tutor-practice-input').fill('Ошибка: команда вернула exit code 1; TOKEN=abcdefghijklmnopqrstuvwxyz');
  await page.locator('#ai-tutor-modal [data-tutor-action="submit"]').click();
  await expect(page.locator('#ai-tutor-result')).toContainText('Локальная помощь с практикой');
  await expect(page.locator('#ai-tutor-result [data-tutor-copy-index]').first()).toBeVisible();

  expect(requests).toHaveLength(4);
  const payloads = requests.map(request => request.postDataJSON());
  for (const payload of payloads) {
    expect(payload.source).toBe('study');
    expect(payload.context.key).toBe('study:devops:1:2');
    expect(payload.context.programId).toBe('devops');
    expect(payload.context.practice.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(payload)).not.toContain('localStorage');
  }
  expect(payloads[1].mode).toBe('socratic');
  expect(payloads[1].turn).toBe(0);
  expect(payloads[2].turn).toBe(1);
  expect(payloads[2].exchanges).toHaveLength(1);
  expect(payloads[2].exchanges[0]).not.toHaveProperty('role');
  expect(payloads[3].mode).toBe('practice');
  expect(payloads[3].practiceInput.length).toBeLessThanOrEqual(8000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

const curriculumSmokeScenarios = [
  { week: 9, day: 3, name: 'container registries', terms: ['Harbor/Nexus', 'Дан вывод'] },
  { week: 12, day: 1, name: 'Yandex Cloud', terms: ['Yandex Cloud', 'Yandex VPC'] },
  { week: 18, day: 3, name: 'Gateway API', terms: ['Gateway API', 'HTTPRoute'] },
  { week: 19, day: 3, name: 'Helm', terms: ['Helm chart', 'templates', 'values'] },
  { week: 20, day: 4, name: 'Argo CD', terms: ['Argo CD', 'self-heal'] },
  { week: 21, day: 3, name: 'Grafana Alloy', terms: ['Grafana Alloy', 'OpenTelemetry Collector'] },
  { week: 22, day: 2, name: 'OpenTelemetry', terms: ['OTLP', 'OpenTelemetry Collector'] },
  { week: 23, day: 5, name: 'software supply chain', terms: ['SBOM', 'Cosign'] },
  { week: 32, day: 5, name: 'final capstone', terms: ['Production capstone', 'Senior Challenge'] },
];

for (const scenario of curriculumSmokeScenarios) {
  test(`renders roadmap week ${scenario.week}: ${scenario.name}`, async ({ page }) => {
    await setProgress(page, {
      ipmax_onboarding: profile,
      ipmax_onboarding_complete: true,
      ipmax_study_position: { week: scenario.week, day: scenario.day },
    });
    await page.goto('/');
    await page.locator('[data-page="study"]').click();

    await expect(page.locator('#study-current')).toContainText(`Неделя ${scenario.week}`);
    await expect(page.locator('#study-test .study-question')).toHaveCount(5);
    for (const term of scenario.terms) {
      await expect(page.locator('#page-study')).toContainText(term);
    }
  });
}
