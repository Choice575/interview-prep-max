const { test, expect } = require('@playwright/test');

// Страница «Банк вопросов» в реальном браузере: переключение категорий,
// раскрытие ответа, поиск, фильтр по уровню, запоминание категории и
// доступность вкладок с клавиатуры.
// Юнит-тесты question-bank-ui.test.js проверяют чистые функции рендера;
// здесь проверяется связка модуля с nav(), localStorage и DOM.

const profile = { role: 'SRE', level: 'Middle', date: '', completedAt: '2026-07-21T00:00:00.000Z' };

// Реальные значения из tasks/question_bank.json — выдуманные дали бы ложно зелёный тест.
const FIRST_CATEGORY = 'linux-boot';
const SECOND_CATEGORY = 'linux-processes';
const FIRST_QUESTION_ID = 'qb_boot_001';

async function seedProfile(page) {
  await page.addInitScript(data => {
    if (sessionStorage.getItem('ipmax_e2e_seeded') === 'true') return;
    sessionStorage.setItem('ipmax_e2e_seeded', 'true');
    localStorage.clear();
    Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
}

test.beforeEach(async ({ page }) => {
  await seedProfile(page);
});

test('открывается по прямой ссылке и показывает состав банка', async ({ page }) => {
  await page.goto('/#/qbank');

  await expect(page.locator('#page-qbank')).toHaveClass(/active/);
  await expect(page.locator('#page-title')).toHaveText('Банк вопросов');

  // Счётчики берутся из датасета: нули означали бы, что данные не загрузились.
  await expect.poll(() => page.locator('#qbank-category-count').textContent())
    .not.toBe('0');
  const categories = Number(await page.locator('#qbank-category-count').textContent());
  const questions = Number(await page.locator('#qbank-question-count').textContent());
  expect(categories).toBeGreaterThanOrEqual(20);
  expect(questions).toBeGreaterThanOrEqual(200);

  // Число вкладок совпадает со счётчиком категорий.
  await expect(page.locator('#qbank-tabs [role="tab"]')).toHaveCount(categories);
});

test('ответ скрыт до клика и раскрывается по вопросу', async ({ page }) => {
  await page.goto('/#/qbank');
  await expect(page.locator('#page-qbank')).toHaveClass(/active/);

  const item = page.locator(`#qbank-item-${FIRST_QUESTION_ID}`);
  const toggle = page.locator(`[data-qbank-toggle="${FIRST_QUESTION_ID}"]`);
  const answer = page.locator(`#qbank-answer-${FIRST_QUESTION_ID}`);

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(answer).toBeHidden();

  await toggle.click();

  await expect(page.locator(`[data-qbank-toggle="${FIRST_QUESTION_ID}"]`))
    .toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`#qbank-answer-${FIRST_QUESTION_ID}`)).toBeVisible();
  await expect(item).toHaveClass(/is-open/);
  await expect(page.locator(`#qbank-answer-${FIRST_QUESTION_ID} .qbank-answer-text`))
    .not.toBeEmpty();
  // Ключевые тезисы — обязательная часть ответа.
  await expect(page.locator(`#qbank-answer-${FIRST_QUESTION_ID} .qbank-points li`).first())
    .toBeVisible();

  // Повторный клик закрывает ответ.
  await page.locator(`[data-qbank-toggle="${FIRST_QUESTION_ID}"]`).click();
  await expect(page.locator(`#qbank-answer-${FIRST_QUESTION_ID}`)).toBeHidden();
});

test('переключение категории меняет панель и запоминается', async ({ page }) => {
  await page.goto('/#/qbank');
  await expect(page.locator(`#qbank-tab-${FIRST_CATEGORY}`)).toHaveAttribute('aria-selected', 'true');

  const firstTitle = await page.locator('#qbank-panel-head h2, .qbank-panel-head h2').first().textContent();

  await page.locator(`#qbank-tab-${SECOND_CATEGORY}`).click();

  await expect(page.locator(`#qbank-tab-${SECOND_CATEGORY}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#qbank-tab-${FIRST_CATEGORY}`)).toHaveAttribute('aria-selected', 'false');
  const secondTitle = await page.locator('.qbank-panel-head h2').first().textContent();
  expect(secondTitle).not.toBe(firstTitle);

  // Выбранная категория сохраняется и восстанавливается после перезагрузки.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_qbank_category'))))
    .toBe(SECOND_CATEGORY);

  await page.reload();
  await expect(page.locator(`#qbank-tab-${SECOND_CATEGORY}`)).toHaveAttribute('aria-selected', 'true');
});

test('поиск сужает список, а пустой результат показывает подсказку', async ({ page }) => {
  await page.goto('/#/qbank');
  await expect(page.locator('#page-qbank')).toHaveClass(/active/);

  const total = await page.locator('#qbank-panel .qbank-item').count();
  expect(total).toBeGreaterThan(1);

  await page.locator('#qbank-search').fill('systemd');
  await expect.poll(() => page.locator('#qbank-panel .qbank-item').count())
    .toBeLessThan(total);

  await page.locator('#qbank-search').fill('нетакогослова');
  await expect(page.locator('#qbank-panel .empty-state')).toBeVisible();

  // Сброс поиска возвращает полный список.
  await page.locator('#qbank-search').fill('');
  await expect.poll(() => page.locator('#qbank-panel .qbank-item').count()).toBe(total);
});

test('фильтр по уровню оставляет только вопросы этого уровня', async ({ page }) => {
  await page.goto('/#/qbank');
  await expect(page.locator('#page-qbank')).toHaveClass(/active/);

  await page.locator('[data-qbank-level="Junior"]').click();

  await expect(page.locator('[data-qbank-level="Junior"]')).toHaveClass(/active/);
  const levels = await page.locator('#qbank-panel .qbank-level').allTextContents();
  expect(levels.length).toBeGreaterThan(0);
  expect(levels.every(text => text.trim() === 'Junior')).toBe(true);

  await page.locator('[data-qbank-level="all"]').click();
  await expect(page.locator('[data-qbank-level="all"]')).toHaveClass(/active/);
  const mixed = await page.locator('#qbank-panel .qbank-level').allTextContents();
  expect(mixed.length).toBeGreaterThan(levels.length);
});

test('вкладки категорий переключаются стрелками', async ({ page }) => {
  await page.goto('/#/qbank');
  await page.locator(`#qbank-tab-${FIRST_CATEGORY}`).focus();

  await page.keyboard.press('ArrowRight');

  await expect(page.locator(`#qbank-tab-${SECOND_CATEGORY}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#qbank-tab-${SECOND_CATEGORY}`)).toBeFocused();

  await page.keyboard.press('Home');
  await expect(page.locator(`#qbank-tab-${FIRST_CATEGORY}`)).toHaveAttribute('aria-selected', 'true');
});

test('переход по меню пишет маршрут и не роняет приложение', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#page-home')).toHaveClass(/active/);

  await page.locator('[data-page="qbank"]').click();

  await expect(page.locator('#page-qbank')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/qbank');
  expect(errors).toEqual([]);

  await page.goBack();
  await expect(page.locator('#page-home')).toHaveClass(/active/);
});
