const { test, expect } = require('@playwright/test');

const profile = { role: 'SRE', level: 'Middle', date: '', completedAt: '2026-07-21T00:00:00.000Z' };

async function setProgress(page, values) {
  await page.addInitScript(data => {
    localStorage.clear();
    Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }, values);
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

test('opens only due repetitions from the coach plan', async ({ page }) => {
  await setProgress(page, {
    ipmax_onboarding: profile,
    ipmax_onboarding_complete: true,
    ipmax_qprog: { 1: { correct: 0, wrong: 1, nextReviewAt: Date.now() - 1 } }
  });
  await page.goto('/');
  await page.locator('#daily-plan-content .btn-outline').click();
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
  await expect(page.locator('#questions-container .q-card')).toHaveCount(1);
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
    buffer: Buffer.from(JSON.stringify({ version: '12.4.0', qprog: [] }))
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog'))['1'].correct)).toBe(1);
});

test('keeps the focused daily plan usable on a compact viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setProgress(page, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
  await page.goto('/');
  await expect(page.locator('#daily-plan-card')).toBeVisible();
  await expect(page.locator('#daily-plan-content .btn-primary')).toBeVisible();
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
