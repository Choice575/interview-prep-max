const {test,expect}=require('@playwright/test');

test('a section opened online remains usable after an offline reload',async({page,context})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('ipmax_onboarding',JSON.stringify({role:'SRE',level:'Middle',date:''}));
    localStorage.setItem('ipmax_onboarding_complete','true');
  });
  await page.goto('/');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await page.locator('[data-page="qbank"]').click();
  await expect(page.locator('#page-qbank')).not.toHaveClass(/page-data-pending/);
  await page.waitForFunction(async()=>!!await caches.match('./tasks/question_bank.json'));
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#page-qbank')).toHaveClass(/active/);
  await expect(page.locator('#page-qbank')).not.toHaveClass(/page-data-pending/);
  await expect(page.locator('#qbank-panel')).not.toBeEmpty();
});
