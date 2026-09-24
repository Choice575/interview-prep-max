// Связывает копии одного вопроса в тестах, банке и карточках общим conceptId (аудит B3, C6).
// Копией считается совпадение формулировки после нормализации регистра, пунктуации и пробелов,
// а смысловые копии перечислены вручную в tasks/concept-links.json.
// Уже выданные conceptId сохраняются, новые группы получают следующий номер.
// Запуск: node scripts/assign-concepts.js [--check]
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
  exam: 'tasks/base_questions.json',
  bank: 'tasks/question_bank.json',
  study: 'tasks/flashcards.json',
  video: 'tasks/video_flashcards.json'
};
const LINKS_FILE = 'tasks/concept-links.json';

const normalize = text => String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();

function collectItems(data) {
  const items = [];
  data.exam.forEach(item => items.push({ kind: 'exam', key: 'exam:' + item.id, text: item.q, item }));
  data.bank.categories.forEach(category => category.questions.forEach(item => items.push({ kind: 'bank', key: 'bank:' + item.id, text: item.q, item })));
  // Шаблонные карточки скрыты и не участвуют в повторении, поэтому в понятия не входят.
  data.study.cards.filter(card => !card.generated).forEach(item => items.push({ kind: 'study', key: 'study:' + item.id, text: item.question, item }));
  data.video.cards.forEach(item => items.push({ kind: 'video', key: 'video:' + item.id, text: item.question, item }));
  return items;
}

function conceptNumber(id) {
  const match = /^c(\d+)$/.exec(String(id || ''));
  return match ? Number(match[1]) : 0;
}

function refKey(ref) {
  const value = String(ref).trim();
  if (/^#\d+$/.test(value)) return 'exam:' + value.slice(1);
  if (/^qb_/.test(value)) return 'bank:' + value;
  if (/^100\d{4}$/.test(value)) return 'study:' + value;
  if (/^200\d{4}$/.test(value)) return 'video:' + value;
  throw new Error('Непонятная ссылка в concept-links: ' + value);
}

function assignConcepts(input, links) {
  const data = structuredClone(input);
  const items = collectItems(data);
  const byKey = new Map(items.map(entry => [entry.key, entry]));
  // Объединение групп: одинаковый текст и ручные связки сливаются через union-find.
  const parent = new Map(items.map(entry => [entry.key, entry.key]));
  const find = key => { while (parent.get(key) !== key) { parent.set(key, parent.get(parent.get(key))); key = parent.get(key); } return key; };
  const union = (a, b) => { const left = find(a); const right = find(b); if (left !== right) parent.set(right, left); };
  const firstByText = new Map();
  for (const entry of items) {
    const text = normalize(entry.text);
    if (!text) continue;
    if (firstByText.has(text)) union(firstByText.get(text), entry.key);
    else firstByText.set(text, entry.key);
  }
  for (const group of (links && links.groups) || []) {
    const keys = group.members.map(refKey);
    keys.forEach(key => { if (!byKey.has(key)) throw new Error(`concept-links «${group.name}»: нет записи ${key}`); });
    keys.slice(1).forEach(key => union(keys[0], key));
  }
  const groups = new Map();
  for (const entry of items) {
    const root = find(entry.key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(entry);
  }
  const shared = [...groups.values()].filter(group => group.length > 1);
  // Детерминированный порядок: сначала группы с уже выданным номером, затем по первому ключу.
  shared.sort((a, b) => {
    const left = Math.min(...a.map(entry => conceptNumber(entry.item.conceptId) || Infinity));
    const right = Math.min(...b.map(entry => conceptNumber(entry.item.conceptId) || Infinity));
    if (left !== right) return left - right;
    return a[0].key.localeCompare(b[0].key);
  });
  let next = Math.max(0, ...items.map(entry => conceptNumber(entry.item.conceptId))) + 1;
  const claimed = new Set();
  const assigned = new Map();
  for (const group of shared) {
    const counts = new Map();
    for (const entry of group) {
      const id = entry.item.conceptId;
      if (conceptNumber(id) && !claimed.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
    }
    const reuse = [...counts.entries()].sort((a, b) => b[1] - a[1] || conceptNumber(a[0]) - conceptNumber(b[0]))[0];
    const id = reuse ? reuse[0] : 'c' + String(next++).padStart(4, '0');
    claimed.add(id);
    group.forEach(entry => assigned.set(entry.key, id));
  }
  for (const entry of items) {
    const id = assigned.get(entry.key);
    if (id) entry.item.conceptId = id;
    else delete entry.item.conceptId;
  }
  return { data, groups: shared.length, members: assigned.size };
}

function writeJson(file, original, value) {
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const pretty = original.trim().split('\n').length > 1;
  const suffix = original.endsWith('\n') ? newline : '';
  fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : undefined).replace(/\n/g, newline) + suffix);
}

function main() {
  const originals = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
  const input = Object.fromEntries(Object.entries(originals).map(([key, text]) => [key, JSON.parse(text)]));
  const links = JSON.parse(fs.readFileSync(path.join(ROOT, LINKS_FILE), 'utf8'));
  const result = assignConcepts(input, links);
  const changed = Object.keys(FILES).filter(key => JSON.stringify(input[key]) !== JSON.stringify(result.data[key]));
  if (process.argv.includes('--check')) {
    if (changed.length) {
      console.error('conceptId устарели в: ' + changed.map(key => FILES[key]).join(', ') + '. Запустите node scripts/assign-concepts.js');
      process.exit(1);
    }
  } else {
    changed.forEach(key => writeJson(path.join(ROOT, FILES[key]), originals[key], result.data[key]));
  }
  console.log(`Понятия: ${result.groups} групп, ${result.members} связанных записей.`);
}

if (require.main === module) main();
module.exports = { assignConcepts, normalize };
