// Editorial replacements only. Code, commands, identifiers and source metadata
// are not translation targets. Longer grammatical phrases take precedence.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const overrides = require('./imports/russian-wording.json');
const rules = [];
function term(key, english, variants) {
  for (const [from, to] of Object.entries(variants)) {
    rules.push({from, to, key, english});
    if (/^[а-яё]/.test(from)) rules.push({from:from[0].toUpperCase()+from.slice(1),to:to[0].toUpperCase()+to.slice(1),key,english});
  }
}
term('evidence', 'evidence', {
  'какой дополнительный evidence нужен': 'какие дополнительные диагностические данные{term} нужны',
  'Какими evidence': 'Какими диагностическими данными',
  'от evidence': 'от диагностических данных',
  'evidence': 'диагностические данные'
});
term('exit-code', 'exit code', {'с exit code':'с кодом завершения','exit code':'код завершения'});
term('blast-radius', 'blast radius', {'blast radius':'область воздействия сбоя'});
term('stop-condition', 'stop-condition', {'stop-condition':'условие остановки'});
term('guardrail', 'guardrail', {
  'измеримым guardrail':'измеримым ограничением безопасности',
  'по guardrail':'при достижении ограничения безопасности',
  'бюджетный guardrail':'ограничение расходов',
  'guardrails':'ограничения безопасности'
});
term('runbook', 'runbook', {
  'краткий runbook':'краткий план действий',
  'по runbook':'по плану действий',
  'Составь runbook':'Составь план действий',
  'обновить runbook':'обновить план действий',
  'runbooks':'планы действий',
  'runbook':'план действий'
});
term('rollback', 'rollback', {
  'rollback/DR-план':'план отката и аварийного восстановления',
  'rollback-план':'план отката',
  'rollback-runbook':'инструкция отката',
  'rollback/DR':'откат и аварийное восстановление',
  'для rollback':'для отката','без rollback':'без отката','после rollback':'после отката',
  'с rollback':'с откатом','до rollback':'до отката','к rollback':'к откату',
  'про rollback':'про откат',
  'rollback':'откат'
});
// «Без изменения состояния» подходило только к проверкам и искажало признак
// объекта: read-only rootfs — файловая система только для чтения (аудит C3).
term('read-only', 'read-only', {
  'read-only командами':'командами только для чтения',
  'минимальным read-only способом':'минимальным способом, не меняющим состояние{term}',
  'проверить гипотезы read-only':'проверить гипотезы, не меняя состояние{term}',
  'read-only':'только для чтения'
});
term('prevention', 'prevention', {'оформить prevention':'предусмотреть меры предотвращения повторного сбоя','prevention':'меры предотвращения повторного сбоя'});
term('mitigation', 'mitigation', {
  'минимальный mitigation':'минимальную меру сдерживания последствий',
  'безопасный mitigation':'безопасную меру сдерживания последствий',
  'до mitigation':'до сдерживания последствий',
  'как mitigation':'как меру сдерживания последствий',
  'безопасной mitigation':'безопасной мерой сдерживания последствий',
  'mitigation':'сдерживание последствий'
});
term('fix', 'fix', {'до проверенного fix':'до проверенного исправления','до fix':'до исправления','постоянный fix':'постоянное исправление','permanent fix':'постоянное исправление','fix':'исправление'});
term('root-cause', 'root cause', {'root-cause diagnosis':'выявление первопричины','Определи root cause':'Определи первопричину','различить root cause':'различить первопричину','подтверждает root cause':'подтверждает первопричину','root cause и action items':'первопричину{term} и конкретные действия','root cause':'первопричина'});
term('impact', 'impact', {'оценить impact':'оценить последствия','Оценить impact':'Оценить последствия','evidence и impact':'диагностические данные и последствия','impact':'влияние на пользователей и систему'});
term('timeline', 'timeline', {'полный timeline':'полную хронологию','вести timeline':'вести хронологию событий','Оформить timeline':'Оформить хронологию событий','с rollout timeline':'с хронологией развёртывания','incident timeline':'хронология инцидента','timeline':'хронология событий'});
term('checklist', 'checklist', {'checklist':'контрольный список'});
term('postmortem', 'postmortem', {'postmortem action item':'конкретное действие по итогам разбора инцидента','postmortem':'разбор инцидента'});
term('lessons-learned', 'lessons learned', {'lessons learned':'выводы по итогам инцидента'});
term('least-privilege', 'least privilege', {'Принцип least privilege':'Принцип минимальных привилегий','до least privilege':'до минимально необходимых привилегий','least privilege':'принцип минимальных привилегий'});
term('supply-chain', 'software supply chain', {'software supply chain':'цепочка поставки программного обеспечения'});
term('production-like', 'production-like', {
  'production-like service':'сервис в условиях, близких к промышленной эксплуатации',
  'production-like проект':'проект в условиях, близких к промышленной эксплуатации'
});
term('production', 'production', {
  'в production-ключе':'с учётом промышленной эксплуатации',
  'production-риск':'риск для рабочей среды',
  // «Рабочая среда (production)» звучало канцелярски (аудит C3): пишем «продакшен».
  'production-среде':'продакшене',
  'production-среду':'продакшен',
  'production-среды':'продакшена',
  'для production':'для продакшена',
  'в production':'в продакшене',
  'из production':'из продакшена'
});
term('capstone', 'capstone', {'Production capstone':'Итоговый проект для промышленной эксплуатации','Capstone v1':'Итоговый проект, версия 1','capstone':'итоговый проект'});
term('game-day', 'game day', {'Game day':'Учебная отработка аварии','game day':'учебная отработка аварии'});
term('troubleshooting', 'troubleshooting', {'Troubleshooting':'Диагностика неисправностей','troubleshooting':'диагностика неисправностей'});
term('senior-case', '', {'Senior case:':'Ситуационная задача для опытного инженера:'});
term('basics', '', {'Ansible basics':'Основы Ansible','Docker basics':'Основы Docker','Kubernetes basics':'Основы Kubernetes','replication basics':'основы репликации'});
term('monitoring', 'monitoring', {'Monitoring':'Мониторинг'});
term('security', '', {'Security':'Безопасность'});
term('networking', '', {'Kubernetes networking':'Сетевая подсистема Kubernetes'});
term('service-operations', '', {'сервис с deploy, rollback, backup, healthcheck, alerting':'сервис с развёртыванием (deploy), откатом (rollback), резервным копированием (backup), проверками работоспособности (healthcheck) и оповещениями (alerting)'});
term('storage-classes', 'storage classes', {'разные storage classes':'разные классы хранения'});
term('namespace', 'namespace', {
  'из другого namespace':'из другого пространства имён',
  'в своём namespace':'в своём пространстве имён',
  'в одном namespace':'в одном пространстве имён',
  'между namespace':'между пространствами имён',
  'Что такое namespace':'Что такое пространство имён'
});
term('infrastructure-as-code', 'Infrastructure as Code', {'Infrastructure as Code':'инфраструктура как код'});
term('garbage-collector', 'garbage collector', {'garbage collector':'сборщик мусора'});
term('garbage-collection', 'garbage collection', {'garbage collection':'сборка мусора'});
term('critical-path', 'critical path', {'critical path':'критический путь выполнения'});
term('smoke-test', 'smoke test', {'выполнить smoke-test':'выполнить проверку основной работоспособности','smoke-test прошёл':'проверка основной работоспособности{term} прошла','повторный smoke-test':'повторная проверка основной работоспособности','smoke-test':'проверка основной работоспособности','smoke-тест':'проверка основной работоспособности'});

// Exact reviewed rewrites handle prose that needs restructuring, not word swaps.
const exact = new Map(overrides.map(entry => [entry.from, entry.to]));
const byPhrase = new Map(rules.map(rule => [rule.from, rule]));
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrases = [...byPhrase.keys()].sort((a,b) => b.length-a.length).map(escape).join('|');
const matcher = new RegExp('(?<![A-Za-z0-9_./-])(?:'+phrases+')(?![A-Za-z0-9_/=-]|\\.[A-Za-z0-9_])', 'g');
// Соседнее английское слово без собственного правила означает, что фраза —
// часть термина или команды (helm rollback, security group, Real User
// Monitoring, leak fix): такие места оставляем как есть, иначе замена ломает и
// смысл, и грамматику (аудит C3). Защищённый фрагмент рядом считается тем же.
const phraseWords = new Set([...byPhrase.keys()].flatMap(phrase => phrase.toLowerCase().split(' ')));
function insideForeignTerm(text, start, end) {
  const before = text.slice(0, start).match(/(?:^|\s)([A-Za-z][\w/-]*(?:\.[\w/-]+)*|\uE000\d+\uE001) $/);
  const after = text.slice(end).match(/^ ([A-Za-z][\w./-]*|\uE000\d+\uE001)/);
  const foreign = match => match && !phraseWords.has(match[1].toLowerCase());
  return foreign(before) || foreign(after);
}
// Protect fenced/inline code, quoted diagnostics, URLs, key/value output and
// command sections. Cyrillic quoted prose remains editable.
const protectedPattern = /```[\s\S]*?```|`[^`]*`|"[^"\n]*"|'[^'\n]*'|https?:\/\/[^\s]+|\([A-Za-z][A-Za-z /-]*\)|\b[A-Za-z_][\w.-]*\s*=\s*[^\s;,]+|\b(?:[a-z]\w*_\w*|changed|failed|ok|name|notify|become|rc|msg|condition)\s*:\s*[A-Za-z0-9_./-]+|Команды: [\s\S]*?(?= Важно:|$)/g;

function translate(text, seen = new Set()) {
  if (typeof text !== 'string') return text;
  function remember(result) {
    for (const rule of rules) if (rule.english && result.includes('('+rule.english+')')) seen.add(rule.key);
    return result;
  }
  if (exact.has(text)) return remember(exact.get(text));
  const saved = [];
  const masked = text.replace(protectedPattern, value => {
    if (/^["']/.test(value) && /[А-Яа-яЁё]/.test(value)) return value;
    saved.push(value);
    return '\uE000'+(saved.length-1)+'\uE001';
  });
  const edited = masked.replace(matcher, (phrase, offset, source) => {
    if (insideForeignTerm(source, offset, offset + phrase.length)) return phrase;
    const rule = byPhrase.get(phrase);
    const label = seen.has(rule.key) || !rule.english ? '' : ' ('+rule.english+')';
    seen.add(rule.key);
    return rule.to.includes('{term}') ? rule.to.replace('{term}',label) : rule.to+label;
  });
  return remember(edited.replace(/\uE000(\d+)\uE001/g, (_, index) => saved[Number(index)]));
}

function editRecord(record) {
  const seen = new Set();
  for (const key of ['q','question','answer','explanation','keyPoints','pitfall']) {
    if (typeof record[key] === 'string') record[key] = translate(record[key], seen);
    else if (Array.isArray(record[key])) record[key] = record[key].map(text => translate(text, seen));
  }
  // Each choice is independently readable; its wording must not depend on order.
  if (Array.isArray(record.options)) record.options = record.options.map(text => translate(text));
}

function main() {
  const root = path.resolve(__dirname, '..');
  const files = ['public/tasks/base_questions.json','public/tasks/question_bank.json','public/tasks/flashcards.json','public/tasks/video_flashcards.json','scripts/imports/swfuse.json'];
  for (const file of files) {
    const location = path.join(root,file);
    const original = fs.readFileSync(location,'utf8');
    const data = JSON.parse(original);
    const records = Array.isArray(data) ? data : data.cards || data.questions || data.categories.flatMap(c => c.questions);
    let changed = 0;
    for (const record of records) {
      const before = JSON.stringify(record);
      editRecord(record);
      if (before !== JSON.stringify(record)) changed++;
    }
    if (process.argv.includes('--check')) assert.equal(changed,0,file+': unapplied wording changes');
    else if (changed) {
      const newline = original.includes('\r\n') ? '\r\n' : '\n';
      const pretty = original.trim().includes('\n');
      fs.writeFileSync(location,JSON.stringify(data,null,pretty?2:undefined).replace(/\n/g,newline)+(original.endsWith('\n')?newline:''));
    }
    console.log(file+': '+changed+' records edited');
  }
}
if (require.main === module) main();
module.exports = {translate, editRecord};
