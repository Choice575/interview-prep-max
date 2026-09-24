const test = require('node:test');
const assert = require('node:assert/strict');
const Check = require('./public/command-check.js');

test('short flags compare as a set, arguments keep their order', () => {
  assert.equal(Check.equivalent('ss -ltnp', 'ss -tlnp'), true);
  assert.equal(Check.equivalent('ss -l -t -n -p', 'ss -tlnp'), true);
  assert.equal(Check.equivalent('  tar  -xzf  a.tgz ', 'tar -xzf a.tgz'), true);
  assert.equal(Check.equivalent('cp b a', 'cp a b'), false);
  assert.equal(Check.equivalent('ss -tln', 'ss -tlnp'), false);
  assert.equal(Check.equivalent('grep -rn "foo bar" .', "grep -nr 'foo bar' ."), true);
  assert.equal(Check.equivalent('ps aux | grep -i nginx', 'ps aux | grep -i nginx'), true);
  assert.equal(Check.equivalent('ps aux | grep nginx', 'ps aux | grep -i nginx'), false);
});

test('checking accepts listed alternatives and explains near misses', () => {
  const task = { opts: ['ss -tlnp', 'netstat -a'], answer: 0, accept: ['netstat -tlnp'] };
  assert.equal(Check.check('netstat -ltnp', task).ok, true);
  assert.equal(Check.check('ss -tln', task).hint, 'Почти: не хватает -p.');
  assert.equal(Check.check('ss -tlnpu', task).hint, 'Почти: лишние -u.');
  assert.equal(Check.check('lsof -i', task).hint, 'Другая команда или конвейер.');
  assert.equal(Check.check('', task).hint, 'Введите команду.');
});
