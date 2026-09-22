const test = require('node:test');
const assert = require('node:assert/strict');
const {translate, editRecord} = require('./scripts/localize-question-prose');

test('wording uses grammatical Russian and defines a term once per question and answer', () => {
  const record = {question:'Опиши диагностику от evidence до fix.',answer:'Собрать evidence; предусмотреть rollback. После rollback проверить exit code.'};
  editRecord(record);
  assert.equal(record.question,'Опиши диагностику от диагностических данных (evidence) до исправления (fix).');
  assert.equal(record.answer,'Собрать диагностические данные; предусмотреть откат (rollback). После отката проверить код завершения (exit code).');
  const once = structuredClone(record);
  editRecord(record);
  assert.deepEqual(record,once);
});

test('wording preserves code, diagnostic messages, paths, URLs and machine output', () => {
  const text = 'Дан вывод: rollback_ready=true; exit_code=1; runbooks=5. `helm rollback app 2` "rollback failed" https://example.com/rollback /srv/rollback.sh. Команды: ./deploy --rollback; terraform state list. Важно: предусмотреть rollback.';
  const result = translate(text);
  for (const literal of ['rollback_ready=true','exit_code=1','runbooks=5','`helm rollback app 2`','"rollback failed"','https://example.com/rollback','/srv/rollback.sh','Команды: ./deploy --rollback; terraform state list.']) assert.ok(result.includes(literal),literal);
  assert.ok(result.endsWith('Важно: предусмотреть откат (rollback).'));
});

test('wording keeps answer index, IDs, source URLs and executable command arrays unchanged', () => {
  const record = {id:10,q:'Как выполнить rollback?',options:['Предусмотреть rollback','Удалить данные'],answer:0,commands:['helm rollback app 2'],sourceUrl:'https://example.com/rollback',collection:'Linux и Bash'};
  editRecord(record);
  assert.equal(record.id,10);
  assert.equal(record.answer,0);
  assert.deepEqual(record.commands,['helm rollback app 2']);
  assert.equal(record.sourceUrl,'https://example.com/rollback');
  assert.equal(record.collection,'Linux и Bash');
  assert.equal(record.options.length,2);
});

test('all committed question datasets already have the reviewed wording applied', () => {
  for (const file of ['./tasks/base_questions.json','./tasks/question_bank.json','./tasks/flashcards.json','./tasks/video_flashcards.json','./scripts/imports/swfuse.json']) {
    const data = require(file);
    const records = Array.isArray(data) ? data : data.cards || data.questions || data.categories.flatMap(c=>c.questions);
    for (const record of records) {
      const edited = structuredClone(record);
      editRecord(edited);
      assert.deepEqual(edited,record,file+' '+record.id);
    }
  }
});
