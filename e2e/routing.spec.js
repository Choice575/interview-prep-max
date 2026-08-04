const { test, expect } = require('@playwright/test');

// Хеш-роутинг в реальном браузере: глубокие ссылки, кнопка «назад»,
// запись хеша при переходах по меню и устойчивость к мусору в адресной строке.
// Юнит-тесты router.test.js проверяют разбор строк; здесь проверяется связка
// роутера с nav(), localStorage и рендером страниц.

const profile = { role: 'SRE', level: 'Middle', date: '', completedAt: '2026-07-21T00:00:00.000Z' };

// Реальные значения из tasks/courses.json — выдуманные slug дали бы ложно зелёный тест.
const COURSE_SLUG = 'git';
const CHAPTER_ID = 'ch_git_w4d1';

async function seedProfile(page) {
  await page.addInitScript(data => {
    if (sessionStorage.getItem('ipmax_e2e_seeded') === 'true') return;
    sessionStorage.setItem('ipmax_e2e_seeded', 'true');
    localStorage.clear();
    Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }, { ipmax_onboarding: profile, ipmax_onboarding_complete: true });
}

function chapterPosition(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ipmax_chapter_position')));
}

test.beforeEach(async ({ page }) => {
  await seedProfile(page);
});

test('открывает главу по прямой ссылке на курс и главу', async ({ page }) => {
  await page.goto(`/#/course/${COURSE_SLUG}/chapter/${CHAPTER_ID}`);

  await expect(page.locator('#page-chapter')).toHaveClass(/active/);
  await expect(page.locator('#chapter-host .chapter-hero')).toBeVisible();
  await expect(page.locator('#chapter-host .chapter-body')).not.toBeEmpty();
  // Хеш не должен переписаться: маршрут уже совпадает с состоянием.
  expect(page.url()).toContain(`#/course/${COURSE_SLUG}/chapter/${CHAPTER_ID}`);
  expect(await chapterPosition(page)).toEqual({ slug: COURSE_SLUG, chapterId: CHAPTER_ID });
});

test('ссылка на курс без главы открывает первую главу курса', async ({ page }) => {
  await page.goto(`/#/course/${COURSE_SLUG}`);

  await expect(page.locator('#page-chapter')).toHaveClass(/active/);
  await expect(page.locator('#chapter-host .chapter-hero')).toBeVisible();
  const position = await chapterPosition(page);
  expect(position.slug).toBe(COURSE_SLUG);
  expect(position.chapterId).toBe(CHAPTER_ID);
});

test('открывает обычный раздел по прямой ссылке', async ({ page }) => {
  await page.goto('/#/study');

  await expect(page.locator('#page-study')).toHaveClass(/active/);
  await expect(page.locator('#study-current')).toContainText('Неделя');
});

test('неизвестный маршрут уводит на главную, а не в пустую страницу', async ({ page }) => {
  await page.goto('/#/no-such-page');

  await expect(page.locator('#page-home')).toHaveClass(/active/);
  await expect(page.locator('#daily-plan-card')).toBeVisible();
});

test('неизвестный курс уводит в каталог', async ({ page }) => {
  await page.goto('/#/course/no-such-course/chapter/no-such-chapter');

  await expect(page.locator('#page-catalog')).toHaveClass(/active/);
  await expect(page.locator('#page-chapter')).not.toHaveClass(/active/);
});

test('битый хеш не роняет приложение', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/#/course/%zz/chapter/%zz');

  await expect(page.locator('#page-home')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('переход по меню пишет маршрут в адресную строку', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#page-home')).toHaveClass(/active/);

  await page.locator('[data-page="study"]').click();
  await expect(page.locator('#page-study')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/study');

  await page.locator('[data-page="analytics"]').click();
  await expect(page.locator('#page-analytics')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/analytics');
});

test('кнопка «назад» возвращает на предыдущий раздел', async ({ page }) => {
  await page.goto('/#/study');
  await expect(page.locator('#page-study')).toHaveClass(/active/);

  await page.locator('[data-page="exam"]').click();
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/exam');

  await page.goBack();
  await expect(page.locator('#page-study')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/study');

  await page.goForward();
  await expect(page.locator('#page-exam')).toHaveClass(/active/);
});

test('кнопка «назад» возвращает в открытую главу', async ({ page }) => {
  await page.goto(`/#/course/${COURSE_SLUG}/chapter/${CHAPTER_ID}`);
  await expect(page.locator('#page-chapter')).toHaveClass(/active/);

  await page.locator('[data-page="home"]').click();
  await expect(page.locator('#page-home')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/');

  await page.goBack();
  await expect(page.locator('#page-chapter')).toHaveClass(/active/);
  await expect(page.locator('#chapter-host .chapter-hero')).toBeVisible();
});

test('глубокая ссылка выживает после перезагрузки страницы', async ({ page }) => {
  await page.goto(`/#/course/${COURSE_SLUG}/chapter/${CHAPTER_ID}`);
  await expect(page.locator('#page-chapter')).toHaveClass(/active/);

  await page.reload();

  await expect(page.locator('#page-chapter')).toHaveClass(/active/);
  await expect(page.locator('#chapter-host .chapter-hero')).toBeVisible();
  expect(page.url()).toContain(`#/course/${COURSE_SLUG}/chapter/${CHAPTER_ID}`);
});

test('переход по главам внутри курса обновляет адресную строку', async ({ page }) => {
  await page.goto(`/#/course/${COURSE_SLUG}/chapter/${CHAPTER_ID}`);
  await expect(page.locator('#page-chapter')).toHaveClass(/active/);

  const next = page.locator('#chapter-host .chapter-nav [data-chapter-open]').last();
  await expect(next).toBeVisible();
  const nextId = await next.getAttribute('data-chapter-open');
  await next.click();

  await expect.poll(() => page.evaluate(() => location.hash))
    .toBe(`#/course/${COURSE_SLUG}/chapter/${nextId}`);
  expect((await chapterPosition(page)).chapterId).toBe(nextId);
});
