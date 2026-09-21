const { test, expect } = require('@playwright/test');

test('finds Swfuse additions in all three modes, reveals answers and preserves existing progress', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ipmax_onboarding', JSON.stringify({ role: 'SRE', level: 'Middle', date: '', completedAt: '2026-09-21T00:00:00Z' }));
    localStorage.setItem('ipmax_onboarding_complete', 'true');
    localStorage.setItem('ipmax_qprog', JSON.stringify({ 1000001: { lastSeen: 10, repetitions: 2 } }));
  });
  const source = /github\.com\/Swfuse\/devops-interview\/blob\/6ac2d862/;
  await page.goto('/#/qbank');
  await page.locator('[data-qbank-category="linux-extra"]').click();
  await page.locator('#qbank-search').fill('Swfuse');
  await page.locator('[data-qbank-toggle="qb_swf_001"]').click();
  await expect(page.locator('#qbank-answer-qb_swf_001')).toContainText('SCHED_OTHER');
  await expect(page.locator('#qbank-answer-qb_swf_001 .question-source a')).toHaveAttribute('href', source);
  await page.locator('[data-page="flashcards"]').click();
  const search = page.locator('[data-flashcards-filter="search"]');
  await search.fill('Swfuse');
  await expect(page.locator('.study-card-meta')).toContainText('1 / 60');
  await expect(page.locator('.study-card-source a')).toHaveAttribute('href', source);
  await search.fill('Kata Containers');
  await page.locator('[data-flashcards-action="reveal"]').click();
  await expect(page.locator('.study-card-answer')).toContainText('виртуальной машине');
  await page.locator('[data-page="exam"]').click();
  await page.locator('#exam-search').fill('Swfuse');
  await expect(page.locator('#questions-load-more')).toContainText('12/60');
  await page.locator('#exam-search').fill('Kata Containers');
  const card = page.locator('#qcard-15007');
  await expect(card).toBeVisible();
  await expect(card.locator('.question-source a')).toHaveAttribute('href', source);
  const correct = await card.locator('.q-opt').first().getAttribute('data-answer');
  await card.locator(`[data-orig-idx="${correct}"]`).click();
  await expect(card).toHaveClass(/correct/);
  await expect(page.locator('#qexpl-15007')).toContainText('гостевого ядра');
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog')));
  expect(progress['1000001'].repetitions).toBe(2);
  expect(progress['15007'].correct).toBe(1);
});
