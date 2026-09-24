// Исполняемые проверки тренажёра regex (аудит C8.4): каждое задание несёт
// входные файлы и ожидаемый результат, и ровно один вариант — отмеченный
// правильным — должен его давать. Структурная проверка validate.js не ловила
// задания, где верны два-три варианта или отмеченный хуже альтернативы.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tasks = require('./tasks/regex.json');

function runOption(command, check) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ipmax-regex-'));
  try {
    const files = check.files || {};
    const place = file => path.join(root, file.replace(/^\//, ''));
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(place(file)), { recursive: true });
      fs.writeFileSync(place(file), content);
    }
    // Абсолютные пути задания переносятся во временный каталог.
    const tops = [...new Set(Object.keys(files).filter(file => file.startsWith('/')).map(file => file.split('/')[1]))];
    let script = command;
    for (const top of tops) script = script.replace(new RegExp(`(?<![\\w./-])/${top}(?=[/\\s'"]|$)`, 'g'), `${root}/${top}`);
    const result = spawnSync('bash', ['-c', script], { cwd: root, encoding: 'utf8', timeout: 5000 });
    let stdout = (result.stdout || '').split(root).join('');
    if (check.sortLines) stdout = stdout.split('\n').filter(Boolean).sort().join('\n') + (stdout ? '\n' : '');
    const expect = check.expect || {};
    if (expect.stdout !== undefined && stdout !== expect.stdout) return false;
    for (const [file, content] of Object.entries(expect.files || {})) {
      if (!fs.existsSync(place(file)) || fs.readFileSync(place(file), 'utf8') !== content) return false;
    }
    return true;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('every regex trainer task has an executable check', () => {
  for (const task of tasks) assert.ok(task.check && task.check.expect, `regex#${task.id}: нет check.expect`);
});

for (const task of tasks) {
  test(`regex#${task.id}: exactly the keyed option produces the expected result`, () => {
    const matching = task.opts.map((command, index) => [index, runOption(command, task.check)])
      .filter(([, ok]) => ok)
      .map(([index]) => index);
    assert.deepEqual(matching, [task.answer], `совпали варианты ${matching.join(', ') || 'никакие'}`);
  });
}
