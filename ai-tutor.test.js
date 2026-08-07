const test = require('node:test');
const assert = require('node:assert/strict');
const Tutor = require('./ai-tutor.js');

const long = (text, count) => text.repeat(count);

function courseInput(overrides) {
  return {
    mode: 'explain',
    style: 'production',
    source: 'course',
    context: {
      key: 'course:linux-base:ch_linux_base_w1d1',
      courseId: 'linux-base',
      chapterId: 'ch_linux_base_w1d1',
      courseTitle: 'Linux: базовый курс',
      chapterTitle: 'Навигация и структура Linux',
      kind: 'lesson',
      level: 'Junior',
      objective: long('Понять файловую систему. ', 200),
      expectedResult: long('Показать проверяемый результат. ', 200),
      practice: Array.from({ length: 14 }, (_, index) => `Команда ${index} ` + long('x', 900)),
      pitfalls: Array.from({ length: 14 }, (_, index) => `Ошибка ${index} ` + long('y', 900)),
      productionLayer: long('Production-контекст. ', 200),
      artifact: long('Артефакт. ', 200),
      secret: 'PRIVATE_CONTEXT_VALUE'
    },
    question: long('Почему это важно? ', 300),
    answer: 'Не должен передаваться в режиме explain',
    diagnosticOutput: 'Не должен передаваться в режиме explain',
    token: 'PRIVATE_TOKEN_VALUE',
    localStorage: { fullProgress: 'PRIVATE_PROGRESS_VALUE' },
    dataset: { allCourses: 'PRIVATE_DATASET_VALUE' },
    ...overrides
  };
}

test('builds an allowlisted bounded explain payload for the current course chapter', () => {
  const payload = Tutor.buildTutorPayload(courseInput());

  assert.deepEqual(Object.keys(payload), [
    'schemaVersion', 'mode', 'style', 'source', 'context', 'question', 'turn', 'exchanges'
  ]);
  assert.deepEqual(Object.keys(payload.context), [
    'key', 'courseId', 'chapterId', 'courseTitle', 'chapterTitle', 'kind', 'level',
    'objective', 'expectedResult', 'practice', 'pitfalls', 'productionLayer', 'artifact', 'materials'
  ]);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.mode, 'explain');
  assert.equal(payload.style, 'production');
  assert.equal(payload.source, 'course');
  assert.equal(payload.question.length, 2000);
  assert.equal(payload.context.objective.length, 2500);
  assert.equal(payload.context.expectedResult.length, 2500);
  assert.equal(payload.context.practice.length, 10);
  assert.equal(payload.context.pitfalls.length, 10);
  assert.equal(payload.context.practice[0].length, 800);
  assert.equal(payload.context.productionLayer.length, 2000);
  assert.equal(payload.context.artifact.length, 1200);
  assert.equal(payload.turn, 0);
  assert.deepEqual(payload.exchanges, []);

  const serialised = JSON.stringify(payload);
  assert.doesNotMatch(serialised, /PRIVATE_CONTEXT_VALUE|PRIVATE_TOKEN_VALUE|PRIVATE_PROGRESS_VALUE|PRIVATE_DATASET_VALUE/);
  assert.doesNotMatch(serialised, /localStorage|dataset|secret|token|diagnosticOutput/);
});

test('builds useful bounded course context for every visible chapter kind without hidden answers', () => {
  const course = { id: 'crs', slug: 'course', title: 'Курс', level: 'Middle', targetLevel: 'Senior' };
  const cases = [
    ['lesson', { id: 'lesson', title: 'Урок', type: 'lesson' }, {
      kind: 'lesson', objective: 'Цель', expectedResult: 'Результат', practice: ['cmd'], pitfalls: ['ошибка'],
      productionLayer: 'production', artifact: 'артефакт'
    }, ['Цель', 'Результат', 'cmd']],
    ['mini', { id: 'mini', title: 'Мини-тест', type: 'test', kind: 'mini' }, {
      kind: 'mini', questions: ['Вопрос 1', 'Вопрос 2'], commonMistakes: ['Ошибка'], expectedAnswers: ['PRIVATE_ANSWER']
    }, ['Вопрос 1', 'Вопрос 2', 'Ошибка']],
    ['weekly', { id: 'weekly', title: 'Недельный тест', type: 'test', kind: 'weekly' }, {
      kind: 'weekly', parts: [{ name: 'Практика', score: 40 }, { name: 'Debug', score: 30 }], maxScore: 100,
      scoring: 'PRIVATE_SCORING'
    }, ['Практика — 40 баллов', 'Debug — 30 баллов']],
    ['incident', { id: 'incident', title: 'Инцидент', type: 'lab', kind: 'incident' }, {
      kind: 'incident', context: 'Сервис недоступен', evidence: ['HTTP 503', '5xx растёт'], task: 'Найти причину',
      expectedActions: ['PRIVATE_ACTION']
    }, ['Сервис недоступен', 'HTTP 503', '5xx растёт', 'Найти причину']],
    ['fix-bug', { id: 'fix', title: 'Исправь ошибку', type: 'lab', kind: 'fix-bug' }, {
      kind: 'fix-bug', scenario: 'Deployment падает', code: 'kubectl apply -f bad.yaml', question: 'Что исправить?',
      fix: 'PRIVATE_FIX'
    }, ['Deployment падает', 'kubectl apply -f bad.yaml', 'Что исправить?']],
    ['external', { id: 'external', title: 'Внешняя практика', type: 'lab', kind: 'external' }, {
      kind: 'external', description: 'Соберите pipeline', evidenceType: ['URL PR', 'лог CI'], difficulty: 'practice', points: 20,
      answer: 'PRIVATE_ANSWER'
    }, ['Соберите pipeline', 'URL PR', 'лог CI']],
    ['simulator', { id: 'sim', title: 'Симулятор', type: 'simulator' }, {
      kind: 'simulator', context: 'Latency выросла', steps: 7, solution: 'PRIVATE_SOLUTION'
    }, ['Latency выросла', '7 состояний']]
  ];

  for (const [kind, chapter, body, visible] of cases) {
    const context = Tutor.buildCourseTutorContext(course, chapter, body);
    assert.equal(context.key, `course:course:${chapter.id}`, kind);
    assert.ok(context.materials.length > 0, `${kind}: нет материала`);
    const serialised = JSON.stringify(context);
    for (const text of visible) assert.ok(serialised.includes(text), `${kind}: ${text}`);
    assert.doesNotMatch(serialised, /PRIVATE_|"(?:expectedAnswers|expectedActions|scoring|solution|fix|answer)"\s*:/i, kind);
    assert.ok(context.materials.length <= 10, kind);
    assert.ok(context.materials.every(item => item.length <= 1200), kind);
  }
});

test('uses visible non-lesson materials in the honest local fallback', () => {
  const context = Tutor.buildCourseTutorContext(
    { id: 'crs', slug: 'linux', title: 'Linux' },
    { id: 'mini', title: 'Проверка процессов', type: 'test', kind: 'mini' },
    { kind: 'mini', questions: ['Чем SIGTERM отличается от SIGKILL?'], commonMistakes: ['Считать сигналы одинаковыми'] }
  );
  const payload = Tutor.buildTutorPayload({ mode: 'explain', source: 'course', context });
  const local = Tutor.buildLocalTutorResponse(payload);

  assert.equal(local.source, 'local');
  assert.match(JSON.stringify(local.sections), /SIGTERM отличается от SIGKILL/);
  assert.match(JSON.stringify(local.sections), /Считать сигналы одинаковыми/);
  assert.doesNotMatch(JSON.stringify(local), /техническую корректность.*проверяет/i);
});

test('builds one bounded Socratic payload for the current DevOps or MLOps study day', () => {
  const payload = Tutor.buildTutorPayload({
    mode: 'socratic',
    style: 'technical',
    source: 'study',
    context: {
      key: 'study:mlops:1:1',
      programId: 'mlops',
      programTitle: 'MLOps',
      week: 1,
      weekTitle: 'Python-окружение',
      day: 1,
      dayTitle: 'Изолированное окружение',
      level: 'Middle',
      mainTopics: Array.from({ length: 14 }, (_, index) => 'Тема ' + index),
      objective: long('Цель. ', 600),
      expectedResult: long('Результат. ', 600),
      practice: Array.from({ length: 12 }, (_, index) => 'Практика ' + index),
      pitfalls: Array.from({ length: 12 }, (_, index) => 'Ошибка ' + index),
      productionLayer: long('Production. ', 400),
      artifact: long('Artifact. ', 400),
      fullMap: 'PRIVATE_MAP',
      tests: 'PRIVATE_TESTS',
      progress: 'PRIVATE_PROGRESS'
    },
    question: 'Проведи опрос по теме',
    turn: 99,
    exchanges: Array.from({ length: 8 }, (_, index) => ({
      question: `Вопрос ${index} ` + long('q', 1400),
      answer: `Ответ ${index} ` + long('a', 4000),
      feedback: `Обратная связь ${index} ` + long('f', 1800),
      hidden: 'PRIVATE_EXCHANGE'
    })),
    token: 'PRIVATE_TOKEN'
  });

  assert.equal(payload.source, 'study');
  assert.equal(payload.mode, 'socratic');
  assert.equal(payload.style, 'technical');
  assert.equal(payload.turn, 5);
  assert.equal(payload.exchanges.length, 5);
  assert.equal(payload.exchanges[0].question.startsWith('Вопрос 3'), true);
  assert.deepEqual(Object.keys(payload.exchanges[0]), ['question', 'answer', 'feedback']);
  assert.equal(payload.exchanges[0].question.length, 1000);
  assert.equal(payload.exchanges[0].answer.length, 3000);
  assert.equal(payload.exchanges[0].feedback.length, 1000);
  assert.deepEqual(Object.keys(payload.context), [
    'key', 'programId', 'programTitle', 'week', 'weekTitle', 'day', 'dayTitle', 'level',
    'mainTopics', 'objective', 'expectedResult', 'practice', 'pitfalls', 'productionLayer', 'artifact'
  ]);
  assert.equal(payload.context.week, 1);
  assert.equal(payload.context.day, 1);
  assert.equal(payload.context.mainTopics.length, 10);
  assert.equal(payload.context.objective.length, 2500);
  assert.equal(payload.context.expectedResult.length, 2500);
  assert.equal(payload.context.practice.length, 10);
  assert.equal(payload.context.pitfalls.length, 10);

  const serialised = JSON.stringify(payload);
  assert.doesNotMatch(serialised, /PRIVATE_MAP|PRIVATE_TESTS|PRIVATE_PROGRESS|PRIVATE_EXCHANGE|PRIVATE_TOKEN/);
  assert.doesNotMatch(serialised, /fullMap|tests|progress|hidden|token/);
});

test('includes only bounded diagnostic text in practice mode and never requests execution', () => {
  const payload = Tutor.buildTutorPayload(courseInput({
    mode: 'practice',
    style: 'technical',
    question: 'Помоги понять ошибку и предложи безопасную проверку',
    practiceInput: long('kubectl describe pod: CrashLoopBackOff\n', 500),
    command: 'PRIVATE_COMMAND_FIELD',
    execute: true,
    shell: 'PRIVATE_SHELL_FIELD',
    run: 'PRIVATE_RUN_FIELD'
  }));

  assert.deepEqual(Object.keys(payload), [
    'schemaVersion', 'mode', 'style', 'source', 'context', 'question', 'turn', 'exchanges', 'practiceInput'
  ]);
  assert.equal(payload.mode, 'practice');
  assert.equal(payload.practiceInput.length, 8000);
  assert.equal(payload.turn, 0);
  assert.deepEqual(payload.exchanges, []);

  const serialised = JSON.stringify(payload);
  assert.doesNotMatch(serialised, /PRIVATE_COMMAND_FIELD|PRIVATE_SHELL_FIELD|PRIVATE_RUN_FIELD/);
  assert.doesNotMatch(serialised, /"execute"|"shell"|"run"/);

  const explain = Tutor.buildTutorPayload(courseInput({ mode: 'explain', practiceInput: 'PRIVATE_DIAGNOSTIC' }));
  assert.equal('practiceInput' in explain, false);
  assert.doesNotMatch(JSON.stringify(explain), /PRIVATE_DIAGNOSTIC/);
});

test('normalises a strict bounded explanation against the trusted payload mode', () => {
  const payload = Tutor.buildTutorPayload(courseInput());
  const result = Tutor.normaliseTutorResponse({
    schemaVersion: 999,
    mode: 'practice',
    title: long('Объяснение ', 100),
    summary: long('Краткий смысл. ', 300),
    sections: Array.from({ length: 12 }, (_, index) => ({
      title: `Раздел ${index}`,
      text: long(`Текст ${index}. `, 300),
      html: '<img src=x onerror=alert(1)>'
    })),
    example: { description: long('Пример. ', 300), code: long('kubectl get pods\n', 700), execute: true },
    checkQuestion: { question: long('Контрольный вопрос? ', 100), expectedAnswer: 'PRIVATE_EXPECTED' },
    nextActions: Array.from({ length: 8 }, (_, index) => ({
      action: long(`Действие ${index}. `, 100),
      successCriterion: long(`Критерий ${index}. `, 100),
      route: 'PRIVATE_ROUTE'
    })),
    caution: long('Ограничение. ', 200),
    source: 'local',
    onclick: 'PRIVATE_HANDLER'
  }, payload);

  assert.deepEqual(Object.keys(result), [
    'schemaVersion', 'mode', 'title', 'summary', 'sections', 'example', 'checkQuestion', 'nextActions', 'caution'
  ]);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.mode, 'explain');
  assert.equal(result.title.length, 200);
  assert.equal(result.summary.length, 1600);
  assert.equal(result.sections.length, 6);
  assert.deepEqual(Object.keys(result.sections[0]), ['title', 'text']);
  assert.equal(result.sections[0].text.length, 2000);
  assert.deepEqual(Object.keys(result.example), ['description', 'code']);
  assert.equal(result.example.description.length, 1200);
  assert.equal(result.example.code.length, 5000);
  assert.deepEqual(Object.keys(result.checkQuestion), ['question']);
  assert.equal(result.checkQuestion.question.length, 1000);
  assert.equal(result.nextActions.length, 5);
  assert.deepEqual(Object.keys(result.nextActions[0]), ['action', 'successCriterion']);
  assert.equal(result.nextActions[0].action.length, 800);
  assert.equal(result.nextActions[0].successCriterion.length, 800);
  assert.equal(result.caution.length, 800);

  const serialised = JSON.stringify(result);
  assert.doesNotMatch(serialised, /PRIVATE_EXPECTED|PRIVATE_ROUTE|PRIVATE_HANDLER|onclick|"route"|"execute"|"html"/);
  assert.equal(Tutor.normaliseTutorResponse({ title: 'Есть', summary: '', sections: [] }, payload), null);
  assert.equal(Tutor.normaliseTutorResponse({ title: 'Есть', summary: 'Итог', sections: [], nextActions: [] }, payload), null);
});

test('normalises one bounded Socratic turn and trusts the payload turn limit', () => {
  const payload = Tutor.buildTutorPayload({
    mode: 'socratic', source: 'study', style: 'interview', turn: 99,
    context: { key: 'study:devops:1:1', programId: 'devops', week: 1, day: 1 },
    question: 'Проведи опрос',
    exchanges: Array.from({ length: 4 }, (_, index) => ({
      question: 'Вопрос ' + index, answer: 'Ответ ' + index, feedback: 'Разбор ' + index
    }))
  });
  const result = Tutor.normaliseTutorResponse({
    mode: 'explain', turn: 1, title: long('Проверка понимания ', 30),
    feedback: long('Верно указано. ', 200),
    hint: long('Подумайте о пространстве имён. ', 100),
    nextQuestion: long('Как это проверить командой? ', 100),
    complete: false,
    summary: long('Промежуточный итог. ', 100),
    expectedAnswer: 'PRIVATE_EXPECTED', html: '<script>alert(1)</script>', route: 'PRIVATE_ROUTE'
  }, payload);

  assert.deepEqual(Object.keys(result), [
    'schemaVersion', 'mode', 'turn', 'title', 'feedback', 'hint', 'nextQuestion', 'complete', 'summary', 'caution'
  ]);
  assert.equal(result.mode, 'socratic');
  assert.equal(result.turn, 4);
  assert.equal(result.title.length, 200);
  assert.equal(result.feedback.length, 1600);
  assert.equal(result.hint.length, 1000);
  assert.equal(result.nextQuestion.length, 1000);
  assert.equal(result.complete, false);
  assert.equal(result.summary.length, 1200);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_EXPECTED|PRIVATE_ROUTE|expectedAnswer|html|route/);

  const lastPayload = Tutor.buildTutorPayload({
    mode: 'socratic', source: 'study', turn: 99,
    context: { key: 'study:devops:1:1', programId: 'devops', week: 1, day: 1 },
    exchanges: Array.from({ length: 5 }, (_, index) => ({
      question: 'Вопрос ' + index, answer: 'Ответ ' + index, feedback: 'Разбор ' + index
    }))
  });
  const last = Tutor.normaliseTutorResponse({
    title: 'Итог опроса', feedback: 'Ответ принят', hint: '',
    nextQuestion: 'Модель пытается задать шестой вопрос', complete: false, summary: 'Пять ходов завершены'
  }, lastPayload);
  assert.equal(last.turn, 5);
  assert.equal(last.complete, true);
  assert.equal(last.nextQuestion, '');

  assert.equal(Tutor.normaliseTutorResponse({ title: 'Есть', nextQuestion: '' }, payload), null);
});

test('normalises safe practice guidance without executable control fields', () => {
  const payload = Tutor.buildTutorPayload(courseInput({
    mode: 'practice', practiceInput: 'kubectl describe pod: CrashLoopBackOff'
  }));
  const result = Tutor.normaliseTutorResponse({
    mode: 'explain',
    title: long('Разбор ошибки ', 30),
    meaning: long('Контейнер перезапускается. ', 100),
    causes: Array.from({ length: 8 }, (_, index) => long(`Причина ${index}. `, 100)),
    checks: Array.from({ length: 8 }, (_, index) => ({
      description: long(`Проверка ${index}. `, 100),
      command: long(`kubectl logs pod-${index}\n`, 300),
      expectedResult: long(`Ожидается ${index}. `, 100),
      execute: true
    })),
    nextStep: {
      description: long('Следующий безопасный шаг. ', 100),
      command: long('kubectl logs pod\n', 300),
      expectedResult: long('Получить конкретную ошибку. ', 100),
      autoRun: true
    },
    stopConditions: Array.from({ length: 8 }, (_, index) => long(`Остановиться ${index}. `, 100)),
    caution: long('Не удаляйте ресурсы без подтверждения. ', 100),
    route: 'PRIVATE_ROUTE', onclick: 'PRIVATE_HANDLER'
  }, payload);

  assert.deepEqual(Object.keys(result), [
    'schemaVersion', 'mode', 'title', 'meaning', 'causes', 'checks', 'nextStep', 'stopConditions', 'caution'
  ]);
  assert.equal(result.mode, 'practice');
  assert.equal(result.title.length, 200);
  assert.equal(result.meaning.length, 1600);
  assert.equal(result.causes.length, 5);
  assert.equal(result.causes[0].length, 800);
  assert.equal(result.checks.length, 5);
  assert.deepEqual(Object.keys(result.checks[0]), ['description', 'command', 'expectedResult']);
  assert.equal(result.checks[0].description.length, 800);
  assert.equal(result.checks[0].command.length, 3000);
  assert.equal(result.checks[0].expectedResult.length, 800);
  assert.deepEqual(Object.keys(result.nextStep), ['description', 'command', 'expectedResult']);
  assert.equal(result.nextStep.command.length, 3000);
  assert.equal(result.stopConditions.length, 5);
  assert.equal(result.stopConditions[0].length, 800);
  assert.equal(result.caution.length, 800);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ROUTE|PRIVATE_HANDLER|execute|autoRun|onclick|route/);

  assert.equal(Tutor.normaliseTutorResponse({ title: 'Есть', meaning: '', checks: [] }, payload), null);
});

test('builds an honest local explanation only from the trusted current context', () => {
  const payload = Tutor.buildTutorPayload(courseInput({
    context: {
      key: 'course:linux:chapter-1', courseId: 'linux', chapterId: 'chapter-1',
      courseTitle: 'Linux', chapterTitle: 'Файловая система', kind: 'lesson', level: 'Junior',
      objective: 'Понять назначение основных каталогов Linux.',
      expectedResult: 'Объяснить различия /etc, /var и /home.',
      practice: ['Выполнить ls -la /', 'Сравнить содержимое /etc и /var'],
      pitfalls: ['Не изменять системные файлы без необходимости'],
      productionLayer: 'Конфигурация и изменяемые данные должны быть разделены.',
      artifact: 'Краткая схема каталогов'
    }
  }));
  const local = Tutor.buildLocalTutorResponse(payload);

  assert.equal(local.source, 'local');
  assert.equal(local.mode, 'explain');
  assert.match(local.title, /Файловая система/);
  assert.match(local.summary, /Понять назначение/);
  assert.equal(local.sections.some(item => item.text.includes('/etc, /var и /home')), true);
  assert.equal(local.sections.some(item => item.text.includes('Конфигурация и изменяемые данные')), true);
  assert.equal(local.nextActions[0].action, 'Выполнить ls -la /');
  assert.match(local.nextActions[0].successCriterion, /Объяснить различия/);
  assert.match(local.caution, /локальн/i);
  assert.match(local.caution, /не заменяет/i);

  const { source: _source, ...strictCandidate } = local;
  assert.ok(Tutor.normaliseTutorResponse(strictCandidate, payload));
  assert.doesNotMatch(JSON.stringify(local), /PRIVATE_/);
});

test('builds an honest local Socratic turn without pretending to grade the answer', () => {
  const payload = Tutor.buildTutorPayload({
    mode: 'socratic', source: 'study', style: 'simple', turn: 2,
    context: {
      key: 'study:devops:2:3', programId: 'devops', programTitle: 'DevOps + AI',
      week: 2, weekTitle: 'Процессы Linux', day: 3, dayTitle: 'Сигналы', level: 'Junior',
      mainTopics: ['SIGTERM', 'SIGKILL'],
      objective: 'Понять безопасное завершение процесса.',
      expectedResult: 'Объяснить различие SIGTERM и SIGKILL.',
      practice: ['Отправить тестовому процессу SIGTERM'],
      pitfalls: ['Не применять SIGKILL первым действием']
    },
    question: 'Продолжи опрос',
    exchanges: [
      { question: 'Что делает SIGTERM?', answer: 'Просит процесс завершиться', feedback: 'Ответ принят' },
      { question: 'Когда нужен SIGKILL?', answer: 'Когда процесс не завершился штатно', feedback: 'Ответ принят' }
    ]
  });
  const local = Tutor.buildLocalTutorResponse(payload);

  assert.equal(local.source, 'local');
  assert.equal(local.mode, 'socratic');
  assert.equal(local.turn, 2);
  assert.equal(local.complete, false);
  assert.match(local.feedback, /не проверяет техническую корректность/i);
  assert.match(local.nextQuestion, /SIGTERM и SIGKILL/i);
  assert.match(local.caution, /локальн/i);

  const finalPayload = Tutor.buildTutorPayload({
    ...payload,
    turn: 99,
    exchanges: Array.from({ length: 5 }, (_, index) => ({
      question: 'Вопрос ' + index, answer: 'Ответ ' + index, feedback: 'Разбор ' + index
    }))
  });
  const final = Tutor.buildLocalTutorResponse(finalPayload);
  assert.equal(final.turn, 5);
  assert.equal(final.complete, true);
  assert.equal(final.nextQuestion, '');
  assert.match(final.summary, /заверш/i);
});

test('builds honest local practice guidance without inventing a diagnosis', () => {
  const payload = Tutor.buildTutorPayload(courseInput({
    mode: 'practice',
    practiceInput: 'CrashLoopBackOff: unknown application error',
    context: {
      key: 'course:k8s:pods', courseId: 'k8s', chapterId: 'pods',
      courseTitle: 'Kubernetes', chapterTitle: 'Диагностика Pod', kind: 'lesson', level: 'Middle',
      objective: 'Научиться собирать наблюдаемые факты до изменения ресурсов.',
      expectedResult: 'Получить события Pod и конкретную ошибку контейнера.',
      practice: ['kubectl describe pod <pod>', 'kubectl logs <pod> --previous'],
      pitfalls: ['Не удалять Pod до сбора событий и логов'],
      productionLayer: 'Сначала диагностика, затем изменение состояния.', artifact: 'Диагностический отчёт'
    }
  }));
  const local = Tutor.buildLocalTutorResponse(payload);

  assert.equal(local.source, 'local');
  assert.equal(local.mode, 'practice');
  assert.match(local.meaning, /фрагмент/i);
  assert.match(local.meaning, /не определяет причину/i);
  assert.deepEqual(local.causes, []);
  assert.equal(local.checks[0].command, 'kubectl describe pod <pod>');
  assert.equal(local.checks[0].expectedResult, 'Получить события Pod и конкретную ошибку контейнера.');
  assert.equal(local.nextStep.command, 'kubectl describe pod <pod>');
  assert.equal(local.stopConditions[0], 'Не удалять Pod до сбора событий и логов');
  assert.match(local.caution, /не выполняет команды/i);
  assert.doesNotMatch(JSON.stringify(local), /unknown application error.*причин/i);
});

test('requests a strict tutor response with the sync token and falls back locally', async () => {
  const input = courseInput({
    context: {
      key: 'course:linux:chapter-1', courseId: 'linux', chapterId: 'chapter-1',
      courseTitle: 'Linux', chapterTitle: 'Файловая система', kind: 'lesson', level: 'Junior',
      objective: 'Понять назначение каталогов.', expectedResult: 'Объяснить /etc и /var.',
      practice: ['Выполнить ls -la /'], pitfalls: ['Не изменять системные файлы'],
      productionLayer: 'Разделяйте конфигурацию и данные.', artifact: 'Схема каталогов'
    }
  });
  let sent;
  const result = await Tutor.requestTutor(input, {
    token: 'device-sync-token',
    fetchImpl: async (url, request) => {
      sent = { url, request };
      return { ok: true, status: 200, json: async () => ({ tutor: {
        source: 'ai', title: 'Каталоги Linux', summary: 'Краткий смысл.',
        sections: [{ title: 'Различие', text: '/etc — конфигурация, /var — изменяемые данные.' }],
        example: { description: 'Посмотрите дерево', code: 'ls -la /' },
        checkQuestion: { question: 'Где искать конфигурацию?' },
        nextActions: [{ action: 'Сравнить каталоги', successCriterion: 'Объяснить различие' }],
        caution: ''
      } }) };
    }
  });

  assert.equal(sent.url, './api/ai/tutor');
  assert.equal(sent.request.method, 'POST');
  assert.equal(sent.request.headers.Authorization, 'Bearer device-sync-token');
  const body = JSON.parse(sent.request.body);
  assert.equal(body.context.chapterId, 'chapter-1');
  assert.equal('token' in body, false);
  assert.doesNotMatch(sent.request.body, /device-sync-token/);
  assert.equal(result.source, 'ai');
  assert.equal(result.mode, 'explain');

  const mock = await Tutor.requestTutor(input, {
    token: 'device-sync-token',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ tutor: {
      source: 'mock', title: 'Mock', summary: 'Тест',
      sections: [{ title: 'Раздел', text: 'Текст' }], example: {}, checkQuestion: {},
      nextActions: [{ action: 'Шаг', successCriterion: 'Критерий' }], caution: ''
    } }) })
  });
  assert.equal(mock.source, 'mock');

  const fallback = await Tutor.tutor(input, {
    token: 'device-sync-token', fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.equal(fallback.source, 'local');
  assert.equal(fallback.fallbackReason, 'offline');
  assert.match(fallback.caution, /локальн/i);

  const noToken = await Tutor.tutor(input, { token: '' });
  assert.equal(noToken.source, 'local');
  assert.equal(noToken.fallbackCode, 'AI_AUTH_REQUIRED');
});

test('redacts common secrets and personal identifiers before provider transport', () => {
  const input = [
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
    'IPMAX_AI_API_KEY=sk-example-secret-value-1234567890',
    'password: SuperSecretPassword123!',
    'https://admin:private-pass@example.test/api',
    '-----BEGIN PRIVATE KEY-----\nVERY_PRIVATE_KEY_BODY\n-----END PRIVATE KEY-----',
    'contact: person@example.com',
    'path: C:\\Users\\Михаил\\project\\config.yaml',
    'pod=api-7f9c CrashLoopBackOff 10.0.0.7 kubectl logs api-7f9c'
  ].join('\n');

  const redacted = Tutor.redactTutorText(input);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz123456|sk-example-secret|SuperSecretPassword|private-pass|VERY_PRIVATE_KEY_BODY|person@example\.com|Users\\Михаил/);
  assert.match(redacted, /Bearer \[REDACTED\]/);
  assert.match(redacted, /IPMAX_AI_API_KEY=\[REDACTED\]/);
  assert.match(redacted, /password: \[REDACTED\]/);
  assert.match(redacted, /https:\/\/\[REDACTED\]@example\.test\/api/);
  assert.match(redacted, /\[REDACTED PRIVATE KEY\]/);
  assert.match(redacted, /\[REDACTED EMAIL\]/);
  assert.match(redacted, /C:\\Users\\\[REDACTED\]\\project\\config\.yaml/);
  assert.match(redacted, /CrashLoopBackOff 10\.0\.0\.7 kubectl logs api-7f9c/);
});

test('redacts common raw provider, GitHub, AWS and JWT credentials without requiring a field name', () => {
  const raw = [
    'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890',
    'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
    'github_pat_11AA0abcdefghijklmnopqrstuvwxyz1234567890',
    'ASIA1BCDEFGHIJKL2MNO',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz1234567890'
  ].join('\n');
  const redacted = Tutor.redactTutorText(raw);

  assert.doesNotMatch(redacted, /sk-proj-|ghp_|github_pat_|ASIA1BCDEFGHIJKL2MNO|eyJhbGciOiJIUzI1NiJ9/);
  assert.equal((redacted.match(/\[REDACTED\]/g) || []).length, 5);
});

test('keeps every canonical Tutor request below the 64 KiB server limit in UTF-8', () => {
  const hugeContext = {
    key: 'study:devops:100:7', programId: 'devops', programTitle: long('П', 500),
    week: 100, weekTitle: long('🚀', 500), day: 7, dayTitle: long('Д', 500), level: 'Senior',
    mainTopics: Array.from({ length: 20 }, () => long('🔥', 300)),
    objective: long('Я', 4000), expectedResult: long('Р', 4000),
    practice: Array.from({ length: 20 }, () => long('🧪', 1200)),
    pitfalls: Array.from({ length: 20 }, () => long('О', 1200)),
    productionLayer: long('П', 4000), artifact: long('А', 3000)
  };
  const cases = [
    { mode: 'explain', question: long('❓', 3000) },
    { mode: 'practice', question: long('❓', 3000), practiceInput: long('💥', 10000) },
    { mode: 'socratic', question: long('❓', 3000), exchanges: Array.from({ length: 8 }, () => ({
      question: long('В', 1500), answer: long('💬', 4000), feedback: long('Ф', 1500)
    })) }
  ];

  for (const input of cases) {
    const payload = Tutor.buildTutorPayload({ ...input, source: 'study', style: 'technical', context: hugeContext });
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    assert.ok(bytes <= 60 * 1024, `${input.mode}: ${bytes} bytes`);
    assert.ok(payload.context.key, input.mode);
    assert.ok(payload.question, input.mode);
  }
});

test('keeps JSON-escaped control characters below the body limit without dropping Socratic turns', () => {
  const escaped = '\u0000"\\'.repeat(4000);
  const context = {
    key: 'study:devops:1:1', programId: 'devops', programTitle: escaped,
    week: 1, weekTitle: escaped, day: 1, dayTitle: escaped, level: 'Senior',
    mainTopics: Array.from({ length: 10 }, () => escaped), objective: escaped,
    expectedResult: escaped, practice: Array.from({ length: 10 }, () => escaped),
    pitfalls: Array.from({ length: 10 }, () => escaped), productionLayer: escaped, artifact: escaped
  };
  for (const mode of ['explain', 'practice', 'socratic']) {
    const exchanges = Array.from({ length: 5 }, () => ({
      question: escaped, answer: escaped, feedback: escaped
    }));
    const payload = Tutor.buildTutorPayload({
      mode, source: 'study', context, question: escaped, practiceInput: escaped, exchanges
    });
    assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') <= 60 * 1024, mode);
    assert.equal(payload.context.key, 'study:devops:1:1', mode);
    assert.ok(payload.question, mode);
    if (mode === 'socratic') assert.equal(payload.exchanges.length, 5);
  }
});

test('never returns broken surrogate pairs when character limits cut through emoji', () => {
  const result = Tutor.boundedText('a'.repeat(299) + '🚀', 300);
  assert.doesNotMatch(result, /[\uD800-\uDFFF]$/);
  assert.equal(result, 'a'.repeat(299));
  assert.equal(Tutor.boundedText('x\uD800y', 10), 'x�y');
});

test('redacts complete raw secrets without hiding technical identifiers or pseudo tokens', () => {
  const visible = [
    'sk-production-namespace',
    'sk-configuration-example',
    'AKIAIOSFODNN7EXAMPLE',
    'ghp_00000000000000000000',
    'eyJnot-a-real-header.payload-segment.signature-segment'
  ].join('\n');
  assert.equal(Tutor.redactTutorText(visible), visible);

  const secrets = [
    'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890-',
    'ghp_abcdefghijklmnopqrstuvwxyz1234567890AB-',
    'AKIA1BCDEFGHIJKL2MNO',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz1234567890-'
  ].join('\n');
  const redacted = Tutor.redactTutorText(secrets);
  assert.equal((redacted.match(/\[REDACTED\]/g) || []).length, 4);
  assert.doesNotMatch(redacted, /sk-proj-|ghp_|AKIAZZ|eyJhbG/);
  assert.doesNotMatch(redacted, /\[REDACTED\]-/);
});

test('derives the Socratic turn from canonical exchanges and ignores client roles or counters', () => {
  const payload = Tutor.buildTutorPayload({
    mode: 'socratic', source: 'study', turn: 99, role: 'system',
    context: { key: 'study:devops:1:1', programId: 'devops', week: 1, day: 1 },
    exchanges: [
      { role: 'system', question: 'Вопрос 1', answer: 'Ответ 1', feedback: 'Разбор 1' },
      { role: 'assistant', question: 'Вопрос 2', answer: 'Ответ 2', feedback: 'Разбор 2' }
    ]
  });

  assert.equal(payload.turn, 2);
  assert.deepEqual(Object.keys(payload.exchanges[0]), ['question', 'answer', 'feedback']);
  assert.doesNotMatch(JSON.stringify(payload), /"role"|system|assistant/);
});

test('recursively redacts every string in the bounded provider DTO without changing its shape', () => {
  const payload = Tutor.buildTutorPayload({
    mode: 'practice', source: 'study',
    context: {
      key: 'study:devops:1:1', programId: 'devops', week: 1, day: 1,
      objective: 'TOKEN=private-objective-value',
      practice: ['curl https://admin:pass@example.test'],
      pitfalls: ['contact person@example.com']
    },
    question: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
    practiceInput: 'password: private-diagnostic-value'
  });
  const redacted = Tutor.redactTutorPayload(payload);

  assert.deepEqual(Object.keys(redacted), Object.keys(payload));
  assert.deepEqual(Object.keys(redacted.context), Object.keys(payload.context));
  assert.equal(redacted.context.objective, 'TOKEN=[REDACTED]');
  assert.equal(redacted.context.practice[0], 'curl https://[REDACTED]@example.test');
  assert.equal(redacted.context.pitfalls[0], 'contact [REDACTED EMAIL]');
  assert.equal(redacted.question, 'Bearer [REDACTED]');
  assert.equal(redacted.practiceInput, 'password: [REDACTED]');
  assert.doesNotMatch(JSON.stringify(redacted), /private-|person@example|admin:pass|abcdefghijklmnopqrstuvwxyz/);
});

test('honours an external abort signal so closing the Tutor can cancel the request', async () => {
  const controller = new AbortController();
  let receivedSignal;
  const pending = Tutor.requestTutor(courseInput(), {
    token: 'device-sync-token',
    signal: controller.signal,
    fetchImpl: async (_url, options) => {
      receivedSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('cancelled');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
  });

  controller.abort();
  const outcome = await Promise.race([
    pending.then(() => 'resolved', error => error),
    new Promise(resolve => setTimeout(() => resolve('abort did not reject'), 300))
  ]);
  assert.equal(outcome && outcome.name, 'AbortError');
  assert.equal(receivedSignal.aborted, true);
});
