const {test,expect} = require('@playwright/test');

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    if(sessionStorage.getItem('quality-seeded')) return;
    sessionStorage.setItem('quality-seeded','true');
    localStorage.setItem('ipmax_onboarding_complete','true');
    localStorage.setItem('ipmax_onboarding',JSON.stringify({role:'SRE',level:'Middle',completedAt:'2026-09-22T00:00:00Z'}));
    localStorage.setItem('ipmax_qprog',JSON.stringify({1000046:{correct:2,wrong:0,lastSeen:42,repetitions:2}}));
  });
});

test('practice is a separate deck and retains previous card progress when rated', async ({page}) => {
  await page.goto('/#/flashcards');
  await expect(page.locator('[data-deck="study"] strong')).toHaveText('2329');
  const practice = page.locator('[data-deck="practice"]');
  await expect(practice).toContainText('Практические сценарии');
  await expect(practice.locator('strong')).toHaveText('90');
  await practice.click();
  await expect(page.locator('.study-card')).toHaveAttribute('data-card-id','1000046');
  await page.locator('[data-flashcards-action="reveal"]').click();
  await page.locator('[data-outcome="pass"]').click();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog'))['1000046']);
  expect(result.correct).toBe(3);
  expect(result.lastSeen).toBeGreaterThan(42);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog'))['1000046'].correct)).toBe(3);
});

test('reviewed answers show a concise version and keyboard-accessible details on mobile', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await page.goto('/#/flashcards');
  await page.locator('[data-flashcards-filter="search"]').fill('DNS использует только UDP');
  await page.locator('[data-flashcards-action="reveal"]').click();
  const answer = page.locator('.study-card-answer');
  await expect(answer.locator('.answer-short')).toContainText('IXFR допускает UDP');
  await expect(answer.locator('.answer-full')).toBeHidden();
  await answer.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(answer.locator('.answer-full')).toBeVisible();
  await expect(answer.locator('.answer-full')).toContainText('dig +tcp example.com');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/#/qbank');
  await page.locator('#qbank-search').fill('DNS использует только UDP');
  await page.locator('[data-qbank-toggle="qb_nx_004"]').click();
  const bank = page.locator('#qbank-answer-qb_nx_004');
  await expect(bank.locator('.answer-short')).toContainText('IXFR допускает UDP');
  await expect(bank.locator('.qbank-commands')).toBeHidden();
  await bank.locator('summary').click();
  await expect(bank.locator('.qbank-commands')).toBeVisible();
});

test('damaged practice progress does not break navigation and is backed up before recovery', async ({page}) => {
  await page.addInitScript(() => {
    if(!localStorage.getItem('external_tasks_completed')) localStorage.setItem('external_tasks_completed','{damaged-original');
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#/external');
  await expect(page.locator('.external-progress-warning')).toContainText('Исходные данные сохранены');
  await page.locator('.btn-submit-evidence').first().click();
  const taskId = await page.locator('.btn-submit-evidence').first().getAttribute('data-task-id');
  await page.locator('#evidence-text').fill('Проверил доступность и сохранил вывод команды.');
  await page.locator('#evidence-submit').click();
  await expect(page.locator('#evidence-modal')).toHaveAttribute('aria-hidden','true');
  await expect(page.locator('.external-progress-warning')).toHaveCount(0);
  const saved = await page.evaluate(() => ({
    progress:JSON.parse(localStorage.getItem('external_tasks_completed')),
    backups:JSON.parse(localStorage.getItem('external_tasks_completed_recovery'))
  }));
  expect(saved.backups[0].raw).toBe('{damaged-original');
  expect(saved.progress[taskId].evidence.text).toContain('Проверил');
  expect(errors).toEqual([]);
});

test('failed recovery backup keeps the original record and the unsaved answer in the form', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('external_tasks_completed','{keep-original');
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      if(key === 'external_tasks_completed_recovery') throw new DOMException('Storage full','QuotaExceededError');
      return set.call(this,key,value);
    };
  });
  await page.goto('/#/external');
  await page.locator('.btn-submit-evidence').first().click();
  await page.locator('#evidence-text').fill('Этот ответ должен остаться в форме.');
  await page.locator('#evidence-submit').click();
  await expect(page.locator('#evidence-error')).toBeVisible();
  await expect(page.locator('#evidence-text')).toHaveValue('Этот ответ должен остаться в форме.');
  expect(await page.evaluate(() => localStorage.getItem('external_tasks_completed'))).toBe('{keep-original');
});
