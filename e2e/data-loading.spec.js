const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block'});
test.beforeEach(async ({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('ipmax_onboarding',JSON.stringify({role:'SRE',level:'Middle',date:''}));
    localStorage.setItem('ipmax_onboarding_complete','true');
  });
});

test('home requests only core questions and the daily skill; sections load on demand',async({page})=>{
  const datasets=[];
  page.on('request',r=>{if(r.url().includes('/tasks/'))datasets.push(new URL(r.url()).pathname);});
  await page.goto('/');
  await expect(page.locator('#daily-plan-card')).toBeVisible();
  await expect(page.locator('#daily-skill-card .skill-card')).toBeVisible();
  expect([...new Set(datasets)].sort()).toEqual(['/tasks/base_questions.json','/tasks/best_practices.json']);
  await page.locator('[data-page="flashcards"]').click();
  await expect(page.locator('#page-flashcards')).not.toHaveClass(/page-data-pending/);
  expect(datasets).toContain('/tasks/flashcards.json');
  expect(datasets).toContain('/tasks/video_flashcards.json');
  await page.locator('[data-page="home"]').click();
  await page.locator('[data-page="flashcards"]').click();
  expect(datasets.filter(x=>x==='/tasks/flashcards.json')).toHaveLength(1);
});

test('a failed optional section can be retried without reloading or losing progress',async({page})=>{
  let broken=true;
  await page.route('**/tasks/video_flashcards.json',route=>broken?route.fulfill({status:503,body:'unavailable'}):route.continue());
  await page.goto('/');
  await expect(page.locator('#daily-plan-card')).toBeVisible();
  await page.evaluate(()=>localStorage.setItem('ipmax_study_progress','{"w1d1":"done"}'));
  await page.locator('[data-page="flashcards"]').click();
  await expect(page.getByRole('button',{name:'Повторить загрузку'})).toBeVisible();
  await page.locator('[data-page="exam"]').click();
  await expect(page.locator('#questions-container .q-card').first()).toBeVisible();
  await page.locator('[data-page="flashcards"]').click();
  await expect(page.getByRole('button',{name:'Повторить загрузку'})).toBeVisible();
  broken=false;
  await page.getByRole('button',{name:'Повторить загрузку'}).click();
  await expect(page.locator('#page-flashcards')).not.toHaveClass(/page-data-pending/);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ipmax_study_progress')).w1d1)).toBe('done');
});

test('a late section response cannot replace a newer navigation',async({page})=>{
  let finish;
  const stalled=new Promise(resolve=>{finish=resolve;});
  await page.route('**/tasks/question_bank.json',async route=>{await stalled;await route.continue();});
  await page.goto('/');
  await expect(page.locator('#daily-plan-card')).toBeVisible();
  await page.locator('[data-page="qbank"]').click();
  await expect(page.locator('#page-qbank')).toHaveClass(/page-data-pending/);
  await page.locator('[data-page="exam"]').click();
  const response=page.waitForResponse('**/tasks/question_bank.json');
  finish();await response;
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
  await expect(page).toHaveURL(/#\/exam$/);
});

test('even failed core questions leave the independent course catalog available',async({page})=>{
  await page.route('**/tasks/base_questions.json',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Повторить загрузку'})).toBeVisible();
  await page.locator('[data-page="catalog"]').click();
  await expect(page.locator('#page-catalog')).not.toHaveClass(/page-data-pending/);
  await expect(page.locator('[data-catalog-open]').first()).toBeVisible();
});
