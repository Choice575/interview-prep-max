const { test, expect } = require('@playwright/test');

const profile = { role: 'SRE', level: 'Middle', date: '', completedAt: '2026-07-21T00:00:00.000Z' };

async function setProgress(page, values) {
  await page.addInitScript(data => {
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

test('gets an AI review through the backend without sending question text', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_coach_control: {
      id: 'control-e2e', startedAt: Date.now() - 60000, completedAt: null,
      questionIds: ['1', '2', '3'], topics: ['Linux', 'Terraform'],
      attempts: [
        { questionId: '1', topic: 'Linux', score: 0, responseSeconds: 35, at: Date.now() - 30000 },
        { questionId: '2', topic: 'Terraform', score: 1, responseSeconds: 20, at: Date.now() - 20000 }
      ]
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: /AI-разбор/ }).click();
  await expect(page.locator('#coach-ai-modal')).toHaveClass(/open/);
  await expect(page.locator('.coach-ai-badge')).toHaveText('Внешний AI');
  await expect(page.locator('.coach-ai-summary')).toContainText('AI-разбор готов');
  await expect(page.locator('#coach-ai-content')).toContainText('Linux');
  await page.getByRole('button', { name: 'Обновить разбор' }).click();
  await expect(page.locator('#coach-ai-close')).toBeFocused();
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
  expect(backup.version).toBe('12.12.0');
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
  await expect(page.locator('#questions-load-more')).toContainText('60/746');
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
  await expect(page.getByRole('tab')).toHaveCount(12);
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
