#!/usr/bin/env node
/**
 * Interview Prep Max — Data Validator
 * Запуск: node validate.js
 * Проверяет все JSON-файлы данных на целостность
 */

const fs = require('fs');
const path = require('path');

const TASKS_DIR = path.join(__dirname, 'tasks');
const KNOWN_TOPICS = ['Terraform', 'Linux', 'Сети', 'Ansible', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Regex'];
const KNOWN_LEVELS = ['Junior', 'Middle', 'Senior'];
const KNOWN_CATEGORIES = ['definition', 'scenario', 'tradeoff', 'output'];
const APP_VERSION = '9.0.0';

let errors = 0, warnings = 0;

function err(msg) { console.error('  ❌ ' + msg); errors++; }
function warn(msg) { console.warn('  ⚠️  ' + msg); warnings++; }
function ok(msg) { console.log('  ✅ ' + msg); }

// ═══ 1. Вопросы ═══
console.log('\n📋 Проверка вопросов (base_questions.json)...');
const qfile = path.join(TASKS_DIR, 'base_questions.json');
if (!fs.existsSync(qfile)) { err('base_questions.json не найден'); }
else {
  const questions = JSON.parse(fs.readFileSync(qfile, 'utf8'));
  ok(`Загружено ${questions.length} вопросов`);

  const ids = new Set();
  const dupIds = [];
  
  questions.forEach((q, i) => {
    const prefix = `Q#${q.id || '?'}[${i}]`;
    
    // Обязательные поля
    if (!q.id) err(`${prefix}: нет id`);
    if (!q.topic) err(`${prefix}: нет topic`);
    if (!q.level) err(`${prefix}: нет level`);
    if (!q.q) err(`${prefix}: нет вопроса`);
    if (!q.options || q.options.length < 2) err(`${prefix}: нужно минимум 2 варианта`);
    if (q.answer === undefined || q.answer === null) err(`${prefix}: нет правильного ответа`);
    
    // Валидация значений
    if (q.topic && !KNOWN_TOPICS.includes(q.topic)) 
      warn(`${prefix}: неизвестная тема "${q.topic}"`);
    if (q.level && !KNOWN_LEVELS.includes(q.level)) 
      warn(`${prefix}: неизвестный уровень "${q.level}"`);
    if (q.category && !KNOWN_CATEGORIES.includes(q.category))
      warn(`${prefix}: неизвестная категория "${q.category}"`);
    
    // Валидация ответа
    if (q.answer !== undefined && q.options && (q.answer < 0 || q.answer >= q.options.length))
      err(`${prefix}: answer=${q.answer} вне диапазона 0..${q.options.length - 1}`);
    
    // Пустые опции
    if (q.options) {
      q.options.forEach((opt, oi) => {
        if (!opt || opt.trim() === '') err(`${prefix}: вариант ${oi} пустой`);
      });
      // Проверка на дубликаты опций
      const unique = new Set(q.options);
      if (unique.size !== q.options.length) warn(`${prefix}: есть дубликаты вариантов`);
    }
    
    // Дубли ID
    if (q.id) {
      if (ids.has(q.id)) dupIds.push(q.id);
      ids.add(q.id);
    }
    
    // Объяснение
    if (!q.explanation) warn(`${prefix}: нет объяснения`);
  });
  
  if (dupIds.length) err(`Найдены дубликаты ID: ${dupIds.join(', ')}`);
  
  // Статистика по темам
  console.log('\n  📊 Распределение по темам:');
  const byTopic = {};
  questions.forEach(q => {
    byTopic[q.topic] = (byTopic[q.topic] || 0) + 1;
  });
  Object.entries(byTopic).sort((a,b) => b[1]-a[1]).forEach(([t,c]) => {
    console.log(`    ${t}: ${c}`);
  });
}

// ═══ 2. Подсети ═══
console.log('\n🌐 Проверка подсетей (subnet.json)...');
const sfile = path.join(TASKS_DIR, 'subnet.json');
if (fs.existsSync(sfile)) {
  const subnets = JSON.parse(fs.readFileSync(sfile, 'utf8'));
  ok(`Загружено ${subnets.length} задач`);
  subnets.forEach((s, i) => {
    if (!s.ip || !s.prefix) err(`Subnet#${i}: нет ip или prefix`);
    if (s.prefix && (s.prefix < 0 || s.prefix > 32)) err(`Subnet#${i}: prefix=${s.prefix} вне диапазона 0-32`);
  });
}

// ═══ 3. Troubleshooting ═══
console.log('\n🔧 Проверка TS-сценариев (ts.json)...');
const tsfile = path.join(TASKS_DIR, 'ts.json');
if (fs.existsSync(tsfile)) {
  const scenarios = JSON.parse(fs.readFileSync(tsfile, 'utf8'));
  ok(`Загружено ${scenarios.length} сценариев`);
  
  const tsIds = new Set();
  scenarios.forEach(s => {
    if (!s.id) err(`TS: нет id`);
    else if (tsIds.has(s.id)) err(`TS: дубликат id=${s.id}`);
    else tsIds.add(s.id);
    
    if (!s.nodes || !s.nodes.start) err(`TS#${s.id}: нет nodes.start`);
    else {
      // Проверяем что все next ссылаются на существующие ноды
      const nodeNames = new Set(Object.keys(s.nodes));
      Object.entries(s.nodes).forEach(([name, node]) => {
        if (node.choices) {
          node.choices.forEach((c, ci) => {
            if (c.next && !nodeNames.has(c.next))
              err(`TS#${s.id}/${name}: выбор ${ci} ссылается на несуществующий узел "${c.next}"`);
            if (c.pts === undefined) warn(`TS#${s.id}/${name}: выбор ${ci} без очков`);
          });
        }
      });
    }
  });
}

// ═══ 4. Тренажёры команд/кода ═══
const trainers = [
  { file: 'cmd.json', name: 'Command Builder', idField: 'id', answerField: 'answer' },
  { file: 'code.json', name: 'Code Reviewer', idField: 'id', answerField: 'answer' },
  { file: 'git.json', name: 'Git', idField: 'id', answerField: 'answer' },
  { file: 'regex.json', name: 'Regex', idField: 'id', answerField: 'answer' },
  { file: 'ansible_pb.json', name: 'Ansible Playbook', idField: 'id', answerField: 'answer' },
  { file: 'dockerfile.json', name: 'Dockerfile', idField: 'id', answerField: 'answer' },
  { file: 'k8s.json', name: 'K8s YAML', idField: 'id', answerField: 'answer' },
  { file: 'ports.json', name: 'Порты', idField: 'id', answerField: null },
];

trainers.forEach(t => {
  console.log(`\n📦 Проверка ${t.name} (${t.file})...`);
  const tfile = path.join(TASKS_DIR, t.file);
  if (!fs.existsSync(tfile)) { warn(`${t.file} не найден`); return; }
  const tasks = JSON.parse(fs.readFileSync(tfile, 'utf8'));
  ok(`Загружено ${tasks.length} заданий`);
  
  const tids = new Set();
  tasks.forEach((task, i) => {
    const id = task[t.idField];
    if (!id) { err(`${t.name}#${i}: нет ${t.idField}`); return; }
    if (tids.has(id)) err(`${t.name}: дубликат ${t.idField}=${id}`);
    tids.add(id);
    
    if (t.answerField && task[t.answerField] !== undefined && task.opts) {
      if (task[t.answerField] < 0 || task[t.answerField] >= task.opts.length)
        err(`${t.name}#${id}: answer=${task[t.answerField]} вне диапазона 0..${task.opts.length - 1}`);
    }
  });
});

// ═══ Итог ═══
console.log(`\n${'═'.repeat(50)}`);
console.log(`Проверка завершена: ${errors} ошибок, ${warnings} предупреждений`);
if (errors === 0 && warnings === 0) console.log('🎉 Все данные в порядке!');
else if (errors === 0) console.log('⚠️  Есть предупреждения, но ошибок нет');
else { console.log('❌ Нужно исправить ошибки перед деплоем'); process.exit(1); }
