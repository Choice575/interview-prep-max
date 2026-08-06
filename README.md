# Interview Prep Max

⚙ DevOps-тренажёр и персональный тренер для подготовки к собеседованиям Middle+/Senior.

**Live**: [choice575.github.io/interview-prep-max](https://choice575.github.io/interview-prep-max/)

## Возможности

| Режим | Описание |
|---|---|
| 🎓 Учёба | DevOps + AI curriculum v5.1 на 32 недели: от Linux до production capstone с Junior+/Middle целью и Senior-track кейсами |
| 📋 Экзамен | 746 вопросов по 12 темам с фильтрами, SRS, флеш-картами и freeform-ответами |
| 🎤 Mock Interview | 12 вопросов с per-question таймером и самооценкой |
| 🔬 Диагностика | 15 вопросов по всем темам, карта сильных/слабых сторон |
| 🚨 Incident Simulation | 4-фазный разбор production-инцидентов: triage → diagnosis → remediation → postmortem |
| 📊 Аналитика | Readiness score, слабые места, «следующие 10 вопросов», ежедневный план |

## Архитектура

```
index.html          — SPA shell
app.js              — логика приложения (UI, state, SRS, trainers)
date.js             — локальные календарные даты без UTC/DST-сдвигов
storage.js          — контракт localStorage и безопасная JSON-сериализация
coach.js            — чистая логика персонального плана: роль, уровень, дата интервью, приоритет тем
ai-coach.js         — приватный клиентский контракт AI-разбора и локальный fallback
coach-ui.js         — UI персонального тренера, weekly review, журнал и AI-разбор
progress.js         — единый SRS и журнал попыток по всем форматам тренировки
progress-io.js      — безопасный экспорт, проверка и транзакционный импорт прогресса
analytics-ui.js     — UI аналитики, готовности и рекомендованных вопросов
home-ui.js          — UI главной, mastery-карточек, истории и быстрых действий
server.js           — статический Node-сервер и same-origin API-прокси для внешнего AI
server/ai-service.js — адаптер OpenAI-compatible провайдера; секреты остаются на сервере
styles.css          — стили (тёмная/светлая тема, responsive)
sw.js               — Service Worker (PWA, offline cache)
validate.js         — валидатор JSON-данных
date.test.js        — unit-тесты календарных границ
coach.test.js       — unit-тесты приоритизации персонального плана
progress.test.js    — unit-тесты SRS и журнала компетенций
*.integration.test.js — проверка цепочки рекомендаций и отдачи app shell
tasks/              — данные
  base_questions.json     — 746 вопросов
  subnet.json             — задачи на подсети
  ts.json                 — troubleshooting-сценарии
  cmd.json, code.json, git.json, regex.json — тренажёры
  ansible_pb.json, dockerfile.json, k8s.json — code review
  ports.json, labs.json   — порты и debugging
  tips.json               — шпаргалки
  study_map.json          — карта 32 учебных недель
  study_tests.json        — мини-тесты и пятничные тесты (160 + 32)
  senior_cases.json       — 38 production-кейсов
  incidents.json          — сценарии инцидентов
```

## Curriculum

Канонический источник учебной последовательности — `devops_learning_plan_v5.1.md`. Приложение не разбирает Markdown во время работы: согласованная версия плана переносится в `tasks/study_map.json`, `tasks/study_tests.json` и `tasks/senior_cases.json` с общей версией `5.1.0`.

Курс рассчитан на 32 недели и готовность к собеседованиям Junior+/начального Middle. Недельный тест оценивается по шкале 100 баллов с порогом 70; работающий артефакт и разбор критических ошибок остаются обязательными условиями завершения недели.

## Быстрый старт

```bash
# Клонировать
git clone https://github.com/Choice575/interview-prep-max.git
cd interview-prep-max

npm ci
npm start
# Открыть http://127.0.0.1:4173

# Проверить данные
npm test
node validate.js
node verify-release.js
npm run test:e2e
```

## Публикация

Приложение публикуется на GitHub Pages **из ветки `main`, корень репозитория** (classic Pages,
`build_type: legacy`). Отдельного deploy-job в CI нет и он не нужен: после `git push origin main`
GitHub сам собирает и публикует сайт своим служебным workflow `pages build and deployment`.

```bash
# перед push — обязательный минимум
npm test
node validate.js
node verify-release.js

git push origin main
```

Проверить, что опубликована именно нужная версия:

```bash
# статус и источник Pages
gh api repos/Choice575/interview-prep-max/pages

# последние публикации
gh run list --workflow 'pages build and deployment' --limit 5
```

В браузере на `https://choice575.github.io/interview-prep-max/` версию видно в консоли:
`self.IPMAX_VERSION`. Она должна совпадать с `version.js` в `main`.

Если CI зелёный, но на Pages старая версия — это кеш Service Worker, а не сбой сборки.
Приложение показывает баннер обновления; кроме того версия кеша меняется вместе с
`IPMAX_VERSION`, поэтому новый Service Worker удаляет прежний кеш при активации.
Для ручной проверки откройте сайт в приватном окне или сравните с `raw.githubusercontent.com`.

## Персональный план

После онбординга главная страница строит ежедневную сессию под выбранную роль, уровень и дату интервью. Тренер учитывает точность, охват тем, практические тренажёры и просроченные SRS-повторы; из плана можно сразу запустить фокусную тренировку или повторение.

## Внешний AI

AI-разбор — опциональная server-side функция. Без настроенного провайдера приложение автоматически использует локальный детерминированный разбор, поэтому статическая публикация и PWA продолжают работать.

Для OpenAI-compatible Chat Completions API задайте переменные окружения перед `npm start`:

```bash
IPMAX_AI_PROVIDER=openai-compatible \
IPMAX_AI_BASE_URL=https://provider.example/v1 \
IPMAX_AI_API_KEY=server-only-secret \
IPMAX_AI_MODEL=provider-model \
npm start
```

Вместо `IPMAX_AI_BASE_URL` можно задать полный `IPMAX_AI_ENDPOINT`. Ключ никогда не попадает в HTML, JavaScript браузера или ответы `/api/ai/status`.

Дополнительно: `IPMAX_AI_TEMPERATURE` (0–2, по умолчанию 0.2), `IPMAX_AI_MAX_TOKENS` (200–8000, по умолчанию 700), `IPMAX_AI_TIMEOUT_MS` (1000–60000, по умолчанию 15000). Для тяжёлых моделей 15 секунд мало — ставьте 30000–45000.

### Настройки AI из интерфейса

Если задан `IPMAX_ADMIN_TOKEN` (минимум 24 символа), провайдера, модель и параметры генерации можно менять в разделе «Настройки AI» без правки переменных и перезапуска сервера — конфигурация читается на каждом запросе.

```bash
IPMAX_ADMIN_TOKEN="$(openssl rand -base64 32)" npm start
```

Токен намеренно отдельный от `IPMAX_SYNC_TOKEN`: одна утечка не должна давать доступ и к прогрессу, и к ключу провайдера.

### Переменные через `.env`

`npm start` читает `.env` из корня, если файл есть, — токены не приходится передавать в командной строке, где они попадают в history шелла. Отсутствие файла не мешает запуску: переменные могут приходить прямо из окружения, как в контейнере. Шаблон — `.env.example`, сам `.env` в `.gitignore` и `.dockerignore`.

```bash
cp .env.example .env   # заполнить значения
npm start
```

Как это устроено с точки зрения секретов:

- API-ключ вводится в UI, но хранится только на сервере (`data/ai-settings.json`, режим `0600`) — в браузер он не возвращается никогда, наружу отдаётся лишь признак `hasKey`;
- пустое поле ключа при сохранении означает «не менять», удаление — отдельная кнопка;
- адрес провайдера принимается только по `https`, исключение — localhost (локальные Ollama/llama.cpp);
- сохранённые из UI настройки перекрывают переменные окружения целиком; кнопка «Сбросить к окружению» возвращает управление переменным.

## Синхронизация между устройствами

Опциональная функция: при заданном `IPMAX_SYNC_TOKEN` (минимум 24 символа) прогресс сливается между устройствами через `POST /api/sync`. Слияние не перезаписывает данные целиком — счётчики берутся по максимуму, журналы объединяются, а позиция в программе и настройки решаются по времени правки, и о таких перезаписях UI сообщает явно. Токен хранится только в браузере устройства и не входит в снимок. Подробности развёртывания — в [DEPLOY.md](DEPLOY.md).

## Формат вопросов

```json
{
  "id": 1,
  "topic": "Linux",
  "level": "Junior",
  "category": "definition",
  "q": "Что делает команда ls?",
  "options": ["Показывает список файлов", "Создаёт файл", "Удаляет файл"],
  "answer": 0,
  "explanation": "ls (list) показывает содержимое текущей директории."
}
```

## Приватность

Прогресс, ответы, настройки и журнал навыков хранятся локально в `localStorage`. При запуске AI-разбора на backend отправляются только агрегаты текущей контрольной: роль/уровень, темы, точность и среднее время ответа. Тексты вопросов, выбранные ответы, заметки и полный прогресс не отправляются. Экспорт/импорт прогресса — через копирование JSON в буфер обмена.

## Лицензия

MIT
