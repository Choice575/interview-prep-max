(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMAX_ASSETS = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  // Единственный список ресурсов приложения (аудит A4.1). Его читают sw.js
  // (офлайн-кеш) и проверки релиза; index.html обязан подключать ровно эти
  // скрипты в этом порядке, иначе verify-release.js остановит релиз.
  // Сервер отдаёт весь каталог public/, поэтому отдельного списка там нет.

  // Порядок важен: модули регистрируют глобальные API, которые читает app.js.
  const scripts = [
    './version.js', './data-loader.js', './date.js', './storage.js',
    './progress.js', './coach.js', './ai-coach.js', './progress-io.js',
    './sync-merge.js', './sync-client.js', './sync-ui.js', './ai-settings-client.js',
    './ai-settings-ui.js', './offline-ui.js', './sources-ui.js', './best-practices-ui.js',
    './catalog-ui.js', './chapter-ui.js', './ai-tutor.js', './ai-tutor-ui.js',
    './router.js', './gamification.js', './gamification-ui.js', './daily.js',
    './daily-ui.js', './trainers-ui.js', './subnet.js', './answer-ui.js',
    './question-bank-ui.js', './external-tasks-ui.js', './polygon-ui.js', './interview-practice-ui.js',
    './analytics-ui.js', './home-ui.js', './exam-ui.js', './flashcards-ui.js',
    './study-ui.js', './coach-ui.js', './app.js'
  ];

  // Оболочка без скриптов: страница, стили, манифест PWA и иконки.
  const shell = [
    './', './index.html', './styles.css', './interview-prep-max.webmanifest',
    './assets/icon-192.png', './assets/icon-512.png', './asset-manifest.js'
  ];

  // Наборы данных кешируются по одному: недоступный файл не срывает установку.
  const data = [
    './tasks/base_questions.json', './tasks/ts.json', './tasks/subnet.json',
    './tasks/cmd.json', './tasks/code.json', './tasks/git.json',
    './tasks/regex.json', './tasks/ansible_pb.json', './tasks/dockerfile.json',
    './tasks/k8s.json', './tasks/ports.json', './tasks/labs.json',
    './tasks/tips.json', './tasks/incidents.json', './tasks/study_map.json',
    './tasks/study_tests.json', './tasks/mlops_map.json', './tasks/mlops_tests.json',
    './tasks/senior_cases.json', './tasks/best_practices.json', './tasks/external_tasks.json',
    './tasks/question_sources.json', './tasks/interview_practice.json', './tasks/courses.json',
    './tasks/question_bank.json', './tasks/flashcards.json', './tasks/video_flashcards.json'
  ];

  // Без них не открывается главная, поэтому их кешируем при установке.
  const coreData = ['./tasks/base_questions.json', './tasks/best_practices.json'];

  return { scripts, shell, data, coreData };
});
