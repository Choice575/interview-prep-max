const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ui = require('./question-bank-ui.js');

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks', 'question_bank.json'), 'utf8'));

const dataset = {
  categories: [
    {
      slug: 'alpha',
      title: 'Альфа',
      icon: '🅰️',
      topic: 'Linux',
      summary: 'Достаточно длинное описание категории для проверки рендера панели.',
      questions: [
        {
          id: 'qb_a_001',
          level: 'Junior',
          q: 'Что такое inode в файловой системе?',
          answer: 'Структура метаданных файла с правами, владельцем и указателями на блоки.',
          keyPoints: ['метаданные', 'имени файла нет', 'номер уникален в ФС'],
          commands: ['stat file', 'df -i'],
          pitfall: 'Смотреть только df -h недостаточно.'
        },
        {
          id: 'qb_a_002',
          level: 'Senior',
          q: 'Как работает OOM killer?',
          answer: 'Ядро выбирает жертву по oom_score и отправляет ей SIGKILL.',
          keyPoints: ['oom_score', 'SIGKILL', 'запись в dmesg'],
          commands: ['dmesg -T'],
          pitfall: null
        }
      ]
    },
    {
      slug: 'beta',
      title: 'Бета',
      icon: '🅱️',
      topic: 'Docker',
      summary: 'Второе описание, тоже достаточно длинное для проверки панели.',
      questions: [
        {
          id: 'qb_b_001',
          level: 'Middle',
          q: 'Чем CMD отличается от ENTRYPOINT?',
          answer: 'ENTRYPOINT задаёт команду, CMD — аргументы по умолчанию.',
          keyPoints: ['ENTRYPOINT команда', 'CMD аргументы', 'exec-форма'],
          commands: [],
          pitfall: 'Shell-форма ломает доставку сигналов.'
        }
      ]
    }
  ]
};

test('categoriesOf и questionsOf терпят мусор на входе', () => {
  assert.deepEqual(ui.categoriesOf(null), []);
  assert.deepEqual(ui.categoriesOf({}), []);
  assert.deepEqual(ui.categoriesOf({ categories: 'нет' }), []);
  assert.deepEqual(ui.questionsOf(null), []);
  assert.deepEqual(ui.questionsOf({ questions: null }), []);
});

test('totalQuestions складывает вопросы всех категорий', () => {
  assert.equal(ui.totalQuestions(dataset), 3);
  assert.equal(ui.totalQuestions(null), 0);
});

test('selectCategory: запрошенная важнее запомненной, иначе первая', () => {
  assert.equal(ui.selectCategory(dataset, 'beta', 'alpha').slug, 'beta');
  assert.equal(ui.selectCategory(dataset, null, 'beta').slug, 'beta');
  assert.equal(ui.selectCategory(dataset, 'нет-такой', null).slug, 'alpha');
  assert.equal(ui.selectCategory({ categories: [] }, 'a', 'b'), null);
});

test('findQuestion ищет по всем категориям и возвращает вопрос с его категорией', () => {
  const found = ui.findQuestion(dataset, 'qb_b_001');
  assert.equal(found.category.slug, 'beta');
  assert.match(found.question.q, /ENTRYPOINT/);
  assert.equal(ui.findQuestion(dataset, 'нет'), null);
  assert.equal(ui.findQuestion(dataset, null), null);
});

test('filterQuestions ищет по вопросу, ответу и тезисам', () => {
  const alpha = dataset.categories[0];
  assert.equal(ui.filterQuestions(alpha, '', 'all').length, 2);
  assert.equal(ui.filterQuestions(alpha, 'inode', 'all').length, 1);
  // совпадение только в тексте ответа
  assert.equal(ui.filterQuestions(alpha, 'oom_score', 'all').length, 1);
  // совпадение только в keyPoints
  assert.equal(ui.filterQuestions(alpha, 'dmesg', 'all').length, 1);
  assert.equal(ui.filterQuestions(alpha, 'такого-нет', 'all').length, 0);
});

test('filterQuestions учитывает уровень и регистр не важен', () => {
  const alpha = dataset.categories[0];
  assert.equal(ui.filterQuestions(alpha, '', 'Senior').length, 1);
  assert.equal(ui.filterQuestions(alpha, '', 'Junior').length, 1);
  assert.equal(ui.filterQuestions(alpha, 'INODE', 'all').length, 1);
  assert.equal(ui.filterQuestions(alpha, 'inode', 'Senior').length, 0);
});

test('levelCounts считает вопросы по уровням', () => {
  assert.deepEqual(ui.levelCounts(dataset.categories[0]), { Junior: 1, Senior: 1 });
  assert.deepEqual(ui.levelCounts({ questions: [] }), {});
});

test('renderTabs отмечает активную вкладку и убирает остальные из tab order', () => {
  const html = ui.renderTabs(dataset, 'beta');
  assert.match(html, /data-qbank-category="beta"/);
  assert.match(html, /aria-selected="true"[^>]*data-qbank-category="beta"/);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 1);
  assert.equal((html.match(/tabindex="-1"/g) || []).length, 1);
  assert.match(html, /class="qbank-tab-count">2</);
});

test('renderList скрывает ответы и раскрывает только выбранный', () => {
  const questions = dataset.categories[0].questions;
  const collapsed = ui.renderList(questions, null);
  assert.equal((collapsed.match(/ hidden>/g) || []).length, 2);
  assert.equal((collapsed.match(/aria-expanded="false"/g) || []).length, 2);

  const expanded = ui.renderList(questions, 'qb_a_001');
  assert.equal((expanded.match(/aria-expanded="true"/g) || []).length, 1);
  assert.equal((expanded.match(/ hidden>/g) || []).length, 1);
  assert.match(expanded, /class="qbank-item is-open"/);
});

test('renderList на пустом списке даёт понятное пустое состояние', () => {
  const html = ui.renderList([], null);
  assert.match(html, /empty-state/);
  assert.match(html, /Ничего не найдено/);
});

test('renderAnswer выводит тезисы, команды и подводный камень', () => {
  const html = ui.renderAnswer(dataset.categories[0].questions[0]);
  assert.match(html, /Ключевые тезисы/);
  assert.match(html, /Команды/);
  assert.match(html, /<code>df -i<\/code>/);
  assert.match(html, /Подводный камень/);
});

test('renderAnswer не рисует пустые блоки', () => {
  const html = ui.renderAnswer(dataset.categories[1].questions[0]);
  assert.doesNotMatch(html, /Команды/, 'пустой список команд не должен давать блок');
  assert.match(html, /Подводный камень/);

  const noPitfall = ui.renderAnswer(dataset.categories[0].questions[1]);
  assert.doesNotMatch(noPitfall, /Подводный камень/, 'pitfall=null не должен давать блок');
  assert.equal(ui.renderAnswer(null), '');
});

test('renderPanel показывает счётчик найденных и распределение по уровням', () => {
  const alpha = dataset.categories[0];
  const filtered = ui.filterQuestions(alpha, 'inode', 'all');
  const html = ui.renderPanel(alpha, filtered, null);
  assert.match(html, /1 из 2/);
  assert.match(html, /Junior: 1/);
  assert.match(html, /Senior: 1/);
  assert.match(html, /Альфа/);
  assert.match(html, /empty-state/.test(html) ? /никогда/ : /qbank-list/);
});

test('renderPanel без категории не бросает', () => {
  assert.match(ui.renderPanel(null, [], null), /недоступен/);
});

test('пользовательские данные экранируются во всех местах вывода', () => {
  const evil = {
    categories: [{
      slug: '"><img src=x>',
      title: '<script>alert(1)</script>',
      icon: '<b>',
      topic: 'Linux',
      summary: '<i>summary</i> достаточной длины для отрисовки панели категории',
      questions: [{
        id: 'qb_x_001',
        level: 'Junior',
        q: '<script>q</script>',
        answer: '<script>a</script>',
        keyPoints: ['<script>k</script>'],
        commands: ['<script>c</script>'],
        pitfall: '<script>p</script>'
      }]
    }]
  };
  const html = ui.renderTabs(evil, '"><img src=x>')
    + ui.renderPanel(evil.categories[0], evil.categories[0].questions, 'qb_x_001');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;script&gt;/);
});

test('nextTabIndex ходит циклически и понимает Home и End', () => {
  assert.equal(ui.nextTabIndex('ArrowRight', 0, 3), 1);
  assert.equal(ui.nextTabIndex('ArrowRight', 2, 3), 0);
  assert.equal(ui.nextTabIndex('ArrowLeft', 0, 3), 2);
  assert.equal(ui.nextTabIndex('Home', 2, 3), 0);
  assert.equal(ui.nextTabIndex('End', 0, 3), 2);
  assert.equal(ui.nextTabIndex('ArrowRight', 0, 0), 0);
});

// ═══ Проверки реального набора данных ═══

test('question_bank.json: структура и уникальность идентификаторов', () => {
  assert.equal(BANK.schemaVersion, 1);
  assert.ok(BANK.source && BANK.source.url, 'должен быть указан источник тем');
  const categories = ui.categoriesOf(BANK);
  assert.ok(categories.length >= 10, `категорий должно быть не меньше 10, сейчас ${categories.length}`);

  const ids = new Set();
  const slugs = new Set();
  const KNOWN_TOPICS = ['Terraform', 'Linux', 'Сети', 'Ansible', 'Docker', 'Kubernetes',
    'CI/CD', 'Git', 'Regex', 'Monitoring', 'Cloud', 'Security', 'System Design'];
  const KNOWN_LEVELS = ['Junior', 'Middle', 'Senior'];

  categories.forEach(category => {
    assert.ok(!slugs.has(category.slug), `дубликат slug ${category.slug}`);
    slugs.add(category.slug);
    assert.ok(KNOWN_TOPICS.includes(category.topic), `неизвестная тема ${category.topic}`);
    assert.ok(category.summary.length >= 40, `короткое summary у ${category.slug}`);
    assert.ok(ui.questionsOf(category).length > 0, `нет вопросов в ${category.slug}`);

    ui.questionsOf(category).forEach(q => {
      assert.ok(!ids.has(q.id), `дубликат id ${q.id}`);
      ids.add(q.id);
      assert.match(q.id, /^qb_[a-z0-9_]+$/, `некорректный id ${q.id}`);
      assert.ok(KNOWN_LEVELS.includes(q.level), `неизвестный уровень ${q.level} у ${q.id}`);
      assert.ok(q.answer.length >= 200, `слишком короткий ответ у ${q.id}`);
      assert.ok(Array.isArray(q.keyPoints) && q.keyPoints.length >= 3, `мало тезисов у ${q.id}`);
      assert.ok(Array.isArray(q.commands), `commands не массив у ${q.id}`);
      assert.ok(q.pitfall === null || typeof q.pitfall === 'string', `некорректный pitfall у ${q.id}`);
    });
  });

  assert.equal(ids.size, ui.totalQuestions(BANK));
});

test('question_bank.json: формулировки корректны и не дублируются', () => {
  const seen = new Map();
  // Часть заданий на собеседовании звучит как просьба, а не вопрос:
  // «Опишите архитектуру…». Бывает и смешанная форма, где вопрос идёт
  // первым, а просьба второй: «Что такое X? Приведите пример.».
  // Поэтому достаточно, чтобы в тексте был знак вопроса ЛИБО повелительный
  // глагол, и формулировка завершалась знаком конца предложения.
  // Без \b: границы слова в JS считаются по ASCII и после кириллицы не срабатывают.
  const IMPERATIVE = /(Опишите|Приведите|Расскажите|Перечислите|Сравните|Объясните) /;
  ui.categoriesOf(BANK).forEach(category => {
    ui.questionsOf(category).forEach(q => {
      const text = q.q.trim();
      const key = text.toLowerCase();
      assert.ok(!seen.has(key), `дубликат вопроса "${q.q}" в ${category.slug} и ${seen.get(key)}`);
      seen.set(key, category.slug);
      assert.ok(
        /[?.»]$/.test(text) && (text.includes('?') || IMPERATIVE.test(text)),
        `формулировка не похожа ни на вопрос, ни на задание: ${q.id} — "${text}"`
      );
    });
  });
});

test('question_bank.json: каждая категория рендерится без потери вопросов', () => {
  ui.categoriesOf(BANK).forEach(category => {
    const questions = ui.filterQuestions(category, '', 'all');
    assert.equal(questions.length, ui.questionsOf(category).length);
    const html = ui.renderPanel(category, questions, null);
    assert.doesNotMatch(html, /empty-state/, `пустая панель у ${category.slug}`);
    assert.doesNotMatch(html, /undefined/, `undefined в разметке ${category.slug}`);
    questions.forEach(q => {
      assert.ok(html.indexOf('qbank-item-' + q.id) !== -1, `вопрос ${q.id} не попал в разметку`);
    });
  });
});
