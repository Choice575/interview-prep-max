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
styles.css          — стили (тёмная/светлая тема, responsive)
sw.js               — Service Worker (PWA, offline cache)
validate.js         — валидатор JSON-данных
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

# Запустить локально
python -m http.server 8080
# Открыть http://localhost:8080

# Проверить данные
node validate.js
```

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

Все данные (прогресс, ответы, настройки) хранятся локально в `localStorage`. Никакие данные не отправляются на сервер. Экспорт/импорт прогресса — через копирование JSON в буфер обмена.

## Лицензия

MIT
