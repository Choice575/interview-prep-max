/* global STUDY_TESTS, renderStudyMiniTest, INCIDENTS, renderIncidentList, renderQuestions */
const { test, expect } = require('@playwright/test');

const hostileId = 'x\');window.__injected=true;//"<img src=x onerror=window.__injected=true>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ipmax_onboarding_complete', 'true');
    localStorage.setItem('ipmax_onboarding', JSON.stringify({ role: 'SRE', level: 'Middle', completedAt: '2026-09-23T00:00:00Z' }));
  });
});

test('study buttons handle quoted IDs as data without executing code', async ({ page }) => {
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto('/#/study');
  await expect(page.locator('#study-test .study-card')).toBeVisible();
  await page.evaluate(id => {
    window.__injected = false;
    const test = { ...STUDY_TESTS.miniTests[0], id };
    STUDY_TESTS.miniTests.push(test);
    renderStudyMiniTest(test, null, false);
  }, hostileId);

  const toggle = page.locator('#study-test [data-study-action="toggle-ref"]').first();
  await expect(toggle).not.toHaveAttribute('onclick');
  await toggle.click();
  await expect(page.locator('#study-test .study-reference').first()).toHaveClass(/open/);
  await page.locator('#study-test [data-study-action="save-mini"]').click();
  expect(await page.evaluate(id => ({
    injected: window.__injected,
    saved: Object.prototype.hasOwnProperty.call(JSON.parse(localStorage.getItem('ipmax_study_answers') || '{}'), id)
  }), hostileId)).toEqual({ injected: false, saved: true });
});

test('incident cards handle quoted IDs as data without executing code', async ({ page }) => {
  await page.goto('/#/incidents');
  await expect(page.locator('#inc-cards .inc-sc-card').first()).toBeVisible();
  await page.evaluate(id => {
    window.__injected = false;
    INCIDENTS.push({ ...INCIDENTS[0], id });
    renderIncidentList();
  }, hostileId);
  const card = page.locator('#inc-cards [data-incident-id]').last();
  await expect(card).toHaveAttribute('data-incident-id', hostileId);
  await expect(card).not.toHaveAttribute('onclick');
  await card.click();
  await expect(page.locator('#inc-cards')).toBeHidden();
  expect(await page.evaluate(() => window.__injected)).toBe(false);
});

test('corrected Terraform key prompts a retake and keeps previous progress', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ipmax_qprog', JSON.stringify({ 9: { correct: 1, wrong: 0, lastSeen: 1 } }));
  });
  await page.goto('/#/exam');
  await page.locator('#exam-search').fill('Что такое tfstate?');
  const card = page.locator('#qcard-9');
  await expect(card.locator('.q-answer-review')).toBeVisible();
  await card.locator('[data-exam-action="answer"][data-orig-idx="1"]').click();
  await page.evaluate(() => renderQuestions());
  await expect(page.locator('#qcard-9 .q-answer-review')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog'))['9'])).toMatchObject({
    correct: 2, wrong: 0, answerKeyReviewedVersion: '15.10.1'
  });
});
