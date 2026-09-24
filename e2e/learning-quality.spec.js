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

test('template practice deck is hidden without dropping its stored progress', async ({page}) => {
  await page.goto('/#/flashcards');
  await expect(page.locator('[data-deck="study"] strong')).toHaveText('1489');
  await expect(page.locator('[data-deck="practice"]')).toHaveCount(0);
  await expect(page.locator('[data-deck="video"]')).toBeVisible();
  await page.locator('[data-flashcards-filter="search"]').fill('Дан вывод для');
  await expect(page.locator('.study-card')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog'))['1000046']);
  expect(stored.correct).toBe(2);
  expect(stored.repetitions).toBe(2);
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

test('an exam answer moves the schedule of the same concept in flashcards', async ({page}) => {
  await page.addInitScript(() => {
    if(sessionStorage.getItem('concept-seeded')) return;
    sessionStorage.setItem('concept-seeded','true');
    localStorage.setItem('ipmax_qprog',JSON.stringify({286:{correct:3,wrong:0,lastSeen:Date.now()-1000,repetitions:3,interval:8,ease:2.7,nextReviewAt:Date.now()+8*86400000}}));
  });
  await page.goto('/#/flashcards');
  await page.locator('[data-flashcards-action="mode"][data-mode="known"]').click();
  await expect(page.locator('.study-card')).toHaveAttribute('data-card-id','1001245');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qprog')));
  expect(stored['1001245'].repetitions).toBe(3);
  expect(stored['1001245'].nextReviewAt).toBe(stored['286'].nextReviewAt);
  expect(stored['1001245'].correct).toBeUndefined();
  expect(stored['286'].correct).toBe(3);
});

test('flashcards open the daily SRS queue and the home card counts due reviews', async ({page}) => {
  await page.addInitScript(() => {
    if(sessionStorage.getItem('today-seeded')) return;
    sessionStorage.setItem('today-seeded','true');
    const past = Date.now() - 60000;
    localStorage.setItem('ipmax_qprog',JSON.stringify({
      1000001:{correct:1,wrong:0,lastSeen:past-86400000,repetitions:1,interval:1,ease:2.5,nextReviewAt:past},
      1000002:{correct:1,wrong:0,lastSeen:past-86400000,repetitions:1,interval:1,ease:2.5,nextReviewAt:past-1000}
    }));
  });
  await page.goto('/');
  await expect(page.locator('.daily-review')).toContainText('2 к повторению сегодня');
  await page.locator('[data-daily-action="flashcards"]').click();
  await expect(page.locator('[data-flashcards-action="mode"][data-mode="today"]')).toHaveClass(/active/);
  await expect(page.locator('.flashcards-results')).toContainText('Найдено: 17 из 1489');
  await expect(page.locator('.study-card')).toHaveAttribute('data-card-id','1000002');
  await page.locator('[data-flashcards-filter="search"]').fill('Swfuse');
  await expect(page.locator('.flashcards-results')).toContainText('Найдено: 54 из 1489');
});

test('subnet trainer generates a host-address task and checks the computed network', async ({page}) => {
  await page.goto('/#/subnet');
  await expect(page.locator('#sp-0 .subnet-ip')).toHaveText('192.168.1.77/24');
  await page.locator('[data-subnet-action="generate"]').click();
  const ip = (await page.locator('#sp-g .subnet-ip').textContent()).trim();
  const [address, prefix] = ip.split('/');
  const answer = await page.evaluate(([value, bits]) => window.IPMaxSubnet.calcSubnet(value, Number(bits)), [address, prefix]);
  expect(answer.network).not.toBe(address);
  for (const field of ['network', 'broadcast', 'first', 'last', 'mask']) await page.locator('#si-g-' + field).fill(answer[field]);
  await page.locator('#si-g-hosts').fill(String(answer.hosts));
  await page.locator('#sp-g button', { hasText: 'Проверить' }).click();
  await expect(page.locator('#sp-badge-g')).toContainText('Верно');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_subnet_prog') || '{}'))).toEqual({});
});

test('the profile hides MLOps cards and Senior questions until the user opts in', async ({page}) => {
  await page.addInitScript(() => {
    if(sessionStorage.getItem('scope-seeded')) return;
    sessionStorage.setItem('scope-seeded','true');
    localStorage.setItem('ipmax_onboarding',JSON.stringify({role:'DevOps',level:'Junior',completedAt:'2026-09-22T00:00:00Z'}));
  });
  await page.goto('/#/flashcards');
  await expect(page.locator('[data-collection="MLOps"]')).toHaveCount(0);
  await page.locator('#fc-scope-bar button').click();
  await expect(page.locator('[data-collection="MLOps"]')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_scope_prefs')).showMlops)).toBe(true);

  await page.goto('/#/exam');
  await expect(page.locator('#level-chips .chip.active')).toHaveText('По профилю');
  await expect(page.locator('#exam-scope-bar')).toContainText('Junior, Middle');
  await expect(page.locator('#questions-container .tag', { hasText: 'Senior' })).toHaveCount(0);
  await page.locator('#exam-scope-bar button').click();
  await expect(page.locator('#exam-scope-bar')).toContainText('Junior, Middle, Senior');
});

test('a long flashcard answer offers recall points that suggest the rating', async ({page}) => {
  await page.goto('/#/flashcards');
  await page.locator('[data-flashcards-filter="search"]').fill('Без агента: только SSH');
  await page.locator('[data-flashcards-action="reveal"]').click();
  const points = page.locator('.study-card-recall input');
  await expect(points).toHaveCount(3);
  await points.nth(0).check();
  await expect(page.locator('.recall-hint')).toContainText('Вспомнили 1 из 3');
  await expect(page.locator('[data-outcome="partial"]')).toHaveClass(/rate-suggested/);
  await page.locator('.study-card-recall input').nth(1).check();
  await page.locator('.study-card-recall input').nth(2).check();
  await expect(page.locator('[data-outcome="pass"]')).toHaveClass(/rate-suggested/);
});

test('spoken answers include bank questions, a two-minute timer and a key-point checklist', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/interview');
  await page.getByRole('button', { name: '📚 Вопросы банка' }).click();
  await expect(page.locator('#ip-detail .ip-kicker')).toContainText('Вопрос банка');
  await expect(page.locator('#ip-ai-evaluate-btn')).toBeHidden();
  await expect(page.locator('#ip-rubric input[type="checkbox"]').first()).toBeVisible();
  const timer = page.locator('#ip-timer-btn');
  await expect(timer).toHaveText('⏱ 2:00');
  await timer.click();
  await page.clock.runFor(30000);
  await expect(timer).toHaveText('⏹ 1:30');
  await page.clock.runFor(91000);
  await expect(timer).toHaveText('⏰ Время вышло');
  await page.locator('#ip-rubric input[type="checkbox"]').first().check();
  await page.locator('#ip-reveal-btn').click();
  await expect(page.locator('#ip-reference')).toContainText('Эталонный ответ');
});

test('sidebar groups sections by activity and highlights the parent of hidden pages', async ({page}) => {
  await page.goto('/#/home');
  await expect(page.locator('#sidebar .sb-nav .sb-section')).toHaveText(['Учиться', 'Повторять', 'Проверять', 'Практиковать']);
  await page.goto('/#/subnet');
  await expect(page.locator('.sb-item[data-page="trainers"]')).toHaveClass(/active/);
  await expect(page.locator('.sb-item[data-page="trainers"]')).toHaveAttribute('aria-current', 'true');
});

test('analytics shows closed profile topics and exports today\'s mistakes as markdown', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('ipmax_stats', JSON.stringify({ total: 1, correct: 0 }));
    localStorage.setItem('ipmax_qprog', JSON.stringify({ 1: { correct: 0, wrong: 1, lastSeen: Date.now() } }));
    localStorage.setItem('ipmax_mistakes', JSON.stringify({ 1: 1 }));
  });
  await page.goto('/#/analytics');
  await expect(page.locator('[data-topic-readiness]')).toContainText(/Тем Middle-профиля закрыто на ≥80%: 0 из \d+/);
  const button = page.locator('[data-analytics-action="export-mistakes"]');
  await expect(button).toHaveText('⬇ Ошибки дня в Markdown (1)');
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toMatch(/^mistakes-\d{4}-\d{2}-\d{2}\.md$/);
  const text = require('node:fs').readFileSync(await download.path(), 'utf8');
  expect(text).toContain('## Terraform');
  expect(text).toContain('**Что такое Terraform?** (#1, Junior)');
});
