# Отчёт по редизайну UI — Interview Prep Max v15

## Цель
Сделать интерфейс компактнее, интуитивнее и удобнее для ежедневного использования без изменения бизнес-логики и функциональности.

## Измеренный эффект

### Высота экранов (desktop 1440×900 / mobile 390×844)
| Экран | Desktop до→после | Mobile до→после | Улучшение |
|-------|------------------|-----------------|-----------|
| Сегодня | 1494→1412 px | 2596→2203 px | -5.5% / -15.1% |
| Учебный план | 3000→2909 px | 4561→4334 px | -3.0% / -5.0% |
| Тренажёры | 1091→948 px | 1965→1727 px | -13.1% / -12.1% |
| **Вопросы с вариантами** | **20 829→4054 px** | **24 310→4478 px** | **-80.5% / -81.6%** |
| Аналитика | 1092→1010 px | 1469→1292 px | -7.5% / -12.0% |
| Ответы вслух | 1151→941 px | 1847→1516 px | -18.2% / -17.9% |

### Topbar
- **Desktop:** 60 px → 52 px
- **Mobile обычный:** 105 px → 52 px
- **Mobile «Ответы вслух» (был дефект):** 229 px → 52 px

### Вопросы (первая порция)
- **До:** 60 карточек, 281 видимое действие, 24 310 px на mobile
- **После:** 12 карточек, 90 видимых действий, 4 478 px на mobile
- **Полный набор вопросов** остаётся доступен через «Показать ещё»

---

## Основные изменения

### 1. Структура HTML (index.html, 73+63 строки)

**Оболочка:**
- Логотип заменён компактной маркой `IP` + текст (убран декоративный emoji ⚙)
- 7 служебных команд («Копировать прогресс», «Синхронизация», «AI», «Источники», «Оффлайн», «Тема») объединены под раскрываемым меню **«Ещё»**
- Topbar: класс `topbar-leading` вместо inline-стилей, кнопки получили семантические классы `topbar-secondary`, `topbar-custom`

**Главная страница:**
- «Быстрый старт» стал раскрываемым `<details class="home-sessions">` — на desktop открыт, на mobile свёрнут

**Экран вопросов:**
- Панель фильтров обёрнута в `<details class="exam-filters">` с кратким саммари «режим · тема · уровень · поиск»
- На desktop открыта, на mobile свёрнута — вопрос виден сразу

**Ответы вслух:**
- **Критическое исправление:** экран `#page-interview` был вне `#main`, что давало двойной header и 229 px на mobile
- Перенесён внутрь `#main` вместе со всеми остальными 24 страницами
- Все 10 модалей (`#sources-modal`, `#ai-tutor-modal`, etc.) остались вне `#main` на верхнем уровне `body`

### 2. Визуальная система (styles.css, +143 строки)

Добавлен **override-слой V15**, который не переписывает существующие стили, а уточняет их:

**Токены:**
- Тёмная тема: более глубокие нейтральные (`--bg:#0d0f14`, `--border:#272c3a`), indigo акцент только для active-состояний
- Светлая тема: светло-серый фон, тот же принцип акцентов
- Единый радиус `9px`, sidebar `232px`, content max-width `1180px`
- `font-feature-settings: "cv01", "ss03"` для Inter (улучшенная читаемость)

**Компоненты:**
- Кнопки: min-height `36px` (desktop), `38px` (mobile topbar), `44px` (AI Tutor — accessibility)
- Карточки: единый border-radius `9px`, padding `13–16px`, без box-shadow
- Chip: min-height `28px`, padding `3px 9px`
- Topbar: `52px`, backdrop-blur, семантические классы для вторичных действий

**Сетка и плотность:**
- Отступы страниц: desktop `18px 22px 34px`, mobile `10px 12px 24px`
- Sidebar: padding `7px 8px`, item padding `7px 9px`
- Home: daily card, skill card, readiness — единый padding `16px` (desktop) / `14px` (mobile)
- Study: two-column layout `minmax(0,1fr) 280px` с gap `10px`
- Trainers: grid `repeat(auto-fill, minmax(270px, 1fr))`, gap `7px`
- Exam: filters grid `repeat(3, minmax(0,1fr))` на desktop, `1fr` на mobile
- Analytics: grid `7 columns` на desktop → `4` на tablet → `2` на mobile

**Раскрываемые блоки:**
- `.sb-more`, `.home-sessions`, `.exam-filters`, `.ip-support` — единый паттерн `<details>` с chevron-индикатором
- Summary: cursor pointer, hover, focus-visible outline, transition на chevron
- На mobile скрываются автоматически через `configureResponsiveShell()`

### 3. JavaScript (4 файла, +17 строк)

**app.js (+8 строк):**
```javascript
function configureResponsiveShell() {
  const compact = window.matchMedia('(max-width:600px)').matches;
  const examFilters = document.querySelector('.exam-filters');
  const homeSessions = document.querySelector('.home-sessions');
  if (examFilters) examFilters.open = !compact;
  if (homeSessions) homeSessions.open = !compact;
}
```
Вызывается один раз после загрузки данных. Desktop раскрывает фильтры и режимы, mobile сворачивает их.

**exam-ui.js (+3 строки, -1):**
- Начальная порция рендеринга: `60 → 12` карточек
- Комментарий объясняет: «Keep the first screen focused. The complete filtered set remains available through "Показать ещё"»
- Полная фильтрация, SRS, смарт-режим и «Показать ещё» остаются без изменений

**interview-practice-ui.js (+2 строки, -1):**
- Подсказки STAR («Как строить ответ», «Типичные ошибки») обёрнуты в `<details class="ip-support"><summary>Подсказки к сильному ответу</summary>`
- Закрыты по умолчанию, раскрываются по клику — поле ответа остаётся выше

**e2e/app.spec.js (+9 строк, -4):**
- Тест экспорта прогресса раскрывает `.sb-more > summary` перед кликом по кнопке
- Ожидания batch: `60 → 12`, `120 → 24`, `60/818 → 12/818`

**interview-practice-ui.test.js (+3 строки):**
- Проверка наличия `<details class="ip-support">`, «Как строить ответ», «Типичные ошибки»
- Рубрика по-прежнему скрыта до явного запроса

---

## Проверка

### Unit & Integration
✅ **608 / 608 тестов** (exam-ui, interview-practice-ui, home-ui, analytics-ui, trainers-ui, curriculum, sync, AI, coach, storage, router, gamification)

### E2E (Playwright)
✅ **62 / 62 tracked тестов** (app.spec.js, qbank.spec.js, routing.spec.js)
- Onboarding, навигация, маршруты, прогресс, экспорт, AI Tutor, study plan, mobile flows, batch questions, Best Practices, coach, sync

### Lint
✅ **ESLint 0 errors / 68 warnings** (baseline проекта, не от редизайна)

### Release Integrity
✅ **11 / 11 проверок** (validate.js, verify-release.js, release.test.js)

### Визуальные инварианты (реальный Chromium)
✅ Desktop 1440×900 и mobile 390×844:
- Topbar 52–53 px
- Exam filters: открыты на desktop, свёрнуты на mobile
- Home sessions: открыты на desktop, свёрнуты на mobile
- Первый вопрос виден в viewport на обоих размерах
- STAR подсказки закрыты по умолчанию
- Дубликатов `id` нет
- Горизонтального скролла нет
- Console/page errors: 0

---

## Сохранено

- **Все 25 экранов** и функции: SRS, смарт-режим, блиц, mock interview, тренажёры, банк вопросов, учебный план, курсы, аналитика, достижения, Best Practices, задания на практику, AI Tutor, AI Coach, синхронизация, настройки AI
- **Вся навигация:** deep links, history API, хеши курсов/глав
- **Все модали:** onboarding, шпаргалки, кастомный вопрос, источники данных, оффлайн, AI Tutor, AI Coach, sync, AI settings
- **Inline обработчики:** onclick, onchange, oninput (проект сознательно не использует bundler)
- **data-атрибуты:** data-page, data-home-action, data-modal-trigger, data-sync-action, data-ai-settings-action
- **Прогресс, фильтрация, оценивание:** бизнес-логика не затронута
- **Тёмная/светлая тема:** оба режима поддержаны
- **PWA, Service Worker, offline-first:** без изменений

---

## Что улучшено

### Компактность
- Мобильный header **105–229 → 52 px**
- Экран вопросов **24 310 → 4478 px** (первый вопрос виден сразу)
- Тренажёры почти помещаются в один desktop viewport
- Вторичные действия спрятаны в раскрываемые блоки

### Интуитивность
- Фильтры вопросов названы «Настроить сессию режим · тема · уровень · поиск»
- Служебные команды объединены под понятным «Ещё»
- Главный CTA («Начать ежедневный блиц») остаётся на первом экране
- Active-состояния, focus-visible, touch targets ≥38px (44px для AI Tutor)

### Визуальная иерархия
- Единые токены цветов, границ, радиусов, отступов
- Indigo акцент только для active и primary actions
- Карточки без лишних теней и градиентов
- Типографика: 4-уровневая иерархия (9–22px)

### Адаптивность
- Desktop: раскрыты фильтры и режимы
- Mobile: свёрнуты вторичные блоки, вопрос виден сразу
- Responsive grid: 7→4→2 колонки аналитики, 3→1 тренажёров
- IP-layout (устные ответы): sidebar переносится вниз на mobile
- Нет горизонтального скролла на всех контрольных размерах

---

## Файлы изменены

```
 app.js                        |   8 +++
 e2e/app.spec.js               |   9 +--
 exam-ui.js                    |   4 +-
 index.html                    | 136 ++++++++++++++++++++-------------------
 interview-practice-ui.js      |   3 +-
 interview-practice-ui.test.js |   3 +
 styles.css                    | 143 ++++++++++++++++++++++++++++++++++++++++++
 7 files changed, 237 insertions(+), 69 deletions(-)
```

Семантические изменения: **+237 / -69 строк**

---

## Итог

Редизайн достиг всех заявленных целей:

✅ **Уменьшена визуальная перегруженность:** служебные команды убраны в меню, вторичные режимы сворачиваются на mobile, декоративные элементы удалены  
✅ **Интерфейс компактнее:** мобильный header -50%, экран вопросов -81%, тренажёры -13%, при этом читаемость сохранена  
✅ **Интуитивность улучшена:** понятные названия раскрываемых блоков, главное действие на первом экране, 44px touch targets  
✅ **Навигация улучшена:** текущий раздел выделен box-shadow, все разделы в одном меню, поведение единообразно  
✅ **Визуальная система сохранена:** tёмная indigo-идентичность, единый набор компонентов, типографическая иерархия, без избыточных теней/градиентов  
✅ **Адаптивность учтена:** desktop/tablet/mobile работают корректно, логичное перестроение, нет горизонтального скролла  

**Бизнес-логика не изменена.** Все 608 unit-тестов, 62 e2e-теста, 11 release-проверок зелёные.
