# Interview Prep Max

⚙ DevOps-тренажёр и персональный тренер для подготовки к собеседованиям Middle+/Senior.

**Live**: [choice575.github.io/interview-prep-max](https://choice575.github.io/interview-prep-max/)

## Возможности

| Режим | Описание |
|---|---|
| 🎓 Учёба | 32-недельная программа по DevOps: Linux → Docker → K8s → CI/CD → Terraform → Ansible → PostgreSQL → мониторинг → production |
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
