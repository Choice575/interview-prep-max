#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const QUESTIONS_FILE = path.join(ROOT, 'tasks', 'base_questions.json');
const BASELINE_FILE = path.join(ROOT, 'question-quality-baseline.json');
const ABSOLUTE_WORDS = [
  'всегда', 'никогда', 'только', 'полностью', 'невозможно',
  'исключительно', 'любой', 'никак'
];
const STOP_WORDS = new Set([
  'какой', 'какая', 'какие', 'каким', 'какую', 'когда', 'который', 'между',
  'почему', 'после', 'перед', 'помощью', 'такое', 'такой', 'также', 'через',
  'чтобы', 'этого', 'этой', 'этот', 'будет', 'делает', 'делать', 'нужно',
  'можно', 'используется', 'работает', 'работать', 'является',
  'what', 'when', 'which', 'with', 'from', 'into', 'does', 'using'
]);
const RULE_LABELS = {
  'length-cue': 'правильный ответ заметно длиннее отвлекающих',
  'question-echo': 'правильный ответ повторяет уникальные слова вопроса',
  'absolute-distractor': 'абсолютная формулировка встречается только в отвлекающем варианте',
  'duplicate-question': 'точный дубликат формулировки вопроса'
};

function cleanOption(text) {
  return String(text || '')
    .trim()
    .replace(/^[a-dа-г][).]\s*/i, '')
    .replace(/\s+/g, ' ');
}

function normalizeText(text) {
  return cleanOption(text)
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/[^a-zа-яё0-9_+./-]+/gi, ' ')
    .trim();
}

function words(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter(word => word.length >= 4 && !STOP_WORDS.has(word));
}

function containsAbsolute(text) {
  const normalized = ` ${normalizeText(text)} `;
  return ABSOLUTE_WORDS.some(word => normalized.includes(` ${word} `));
}

function addIssue(issues, rule, question, detail) {
  issues.push({
    rule,
    id: question.id,
    topic: question.topic,
    level: question.level,
    detail
  });
}

function analyzeQuestions(questions) {
  const issues = [];
  const positions = [0, 0, 0, 0];
  const duplicates = new Map();

  questions.forEach(question => {
    if (!Array.isArray(question.options) || !Number.isInteger(question.answer)) return;
    const options = question.options.map(cleanOption);
    const correct = options[question.answer] || '';
    const distractors = options.filter((_, index) => index !== question.answer);
    positions[question.answer] = (positions[question.answer] || 0) + 1;

    const distractorLengths = distractors.map(option => option.length).sort((a, b) => a - b);
    const medianLength = distractorLengths[Math.floor(distractorLengths.length / 2)] || 0;
    if (correct.length - medianLength >= 12 && correct.length >= medianLength * 1.5) {
      addIssue(issues, 'length-cue', question, `${correct.length} символов против медианы ${medianLength}`);
    }

    const optionWordSets = options.map(option => new Set(words(option)));
    const echoed = [...new Set(words(question.q))].filter(word => {
      if (!optionWordSets[question.answer].has(word)) return false;
      return optionWordSets.every((set, index) => index === question.answer || !set.has(word));
    });
    if (echoed.length >= 2) {
      addIssue(issues, 'question-echo', question, echoed.slice(0, 4).join(', '));
    }

    if (!containsAbsolute(correct) && distractors.some(containsAbsolute)) {
      addIssue(issues, 'absolute-distractor', question, 'абсолютное слово есть только в неверном варианте');
    }

    const normalizedQuestion = normalizeText(question.q);
    if (!duplicates.has(normalizedQuestion)) duplicates.set(normalizedQuestion, []);
    duplicates.get(normalizedQuestion).push(question);
  });

  duplicates.forEach(group => {
    if (group.length < 2) return;
    const ids = group.map(question => question.id).join(', ');
    group.slice(1).forEach(question => addIssue(issues, 'duplicate-question', question, `дублирует вопросы ${ids}`));
  });

  const byRule = Object.fromEntries(Object.keys(RULE_LABELS).map(rule => [rule, 0]));
  const byTopic = {};
  const byLevel = {};
  issues.forEach(issue => {
    byRule[issue.rule]++;
    byTopic[issue.topic] ||= Object.fromEntries(Object.keys(RULE_LABELS).map(rule => [rule, 0]));
    byLevel[issue.level] ||= Object.fromEntries(Object.keys(RULE_LABELS).map(rule => [rule, 0]));
    byTopic[issue.topic][issue.rule]++;
    byLevel[issue.level][issue.rule]++;
  });

  return {
    questionCount: questions.length,
    positions,
    byRule,
    byTopic,
    byLevel,
    issues
  };
}

function rebalanceAnswers(questions) {
  return questions.map((question, index) => {
    if (!Array.isArray(question.options) || question.options.length !== 4 || !Number.isInteger(question.answer)) {
      return question;
    }
    const options = question.options.map(cleanOption);
    const target = index % 4;
    if (question.answer !== target) {
      [options[question.answer], options[target]] = [options[target], options[question.answer]];
    }
    return { ...question, options, answer: target };
  });
}

function makeBaseline(report) {
  return {
    schemaVersion: 1,
    questionCount: report.questionCount,
    answerPositions: report.positions,
    issueBudget: report.byRule,
    topics: report.byTopic,
    levels: report.byLevel
  };
}

function compareToBaseline(report, baseline) {
  const failures = [];
  if (report.questionCount !== baseline.questionCount) {
    failures.push(`число вопросов изменилось: ${report.questionCount}, baseline ${baseline.questionCount}`);
  }
  Object.keys(RULE_LABELS).forEach(rule => {
    const actual = report.byRule[rule] || 0;
    const budget = baseline.issueBudget?.[rule] || 0;
    if (actual > budget) failures.push(`${rule}: ${actual}, допустимо ${budget}`);
  });
  const usedPositions = report.positions.slice(0, 4);
  if (Math.max(...usedPositions) - Math.min(...usedPositions) > 1) {
    failures.push(`позиции ответов несбалансированы: ${usedPositions.join(' / ')}`);
  }
  return failures;
}

function printReport(report) {
  console.log(`Question quality: ${report.questionCount} вопросов`);
  console.log(`Позиции A/B/C/D: ${report.positions.slice(0, 4).join(' / ')}`);
  Object.entries(RULE_LABELS).forEach(([rule, label]) => {
    console.log(`  ${rule}: ${report.byRule[rule]} — ${label}`);
  });
  console.log('\nПо темам:');
  Object.entries(report.byTopic).forEach(([topic, rules]) => {
    const total = Object.values(rules).reduce((sum, value) => sum + value, 0);
    console.log(`  ${topic}: ${total}`);
  });
}

function readQuestions() {
  return JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
}

function runCli(args = process.argv.slice(2)) {
  let questions = readQuestions();
  if (args.includes('--fix-positions')) {
    questions = rebalanceAnswers(questions);
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2) + '\n');
    console.log('Позиции ответов выровнены, префиксы вариантов удалены.');
  }

  const report = analyzeQuestions(questions);
  if (args.includes('--write-baseline')) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(makeBaseline(report), null, 2) + '\n');
    console.log('Baseline обновлён: question-quality-baseline.json');
  }
  printReport(report);

  if (args.includes('--check')) {
    if (!fs.existsSync(BASELINE_FILE)) {
      console.error('Нет question-quality-baseline.json. Запустите npm run quality:questions:baseline.');
      process.exitCode = 1;
      return;
    }
    const failures = compareToBaseline(report, JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')));
    if (failures.length) {
      console.error('\nQuality gate не пройден:');
      failures.forEach(failure => console.error(`  - ${failure}`));
      process.exitCode = 1;
    } else {
      console.log('\nQuality gate пройден: новых подсказок и перекоса позиций нет.');
    }
  }
}

if (require.main === module) runCli();

module.exports = {
  analyzeQuestions,
  cleanOption,
  compareToBaseline,
  makeBaseline,
  rebalanceAnswers
};
