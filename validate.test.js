const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('accepts the complete curriculum in strict mode', () => {
  const result = spawnSync(process.execPath, ['validate.js', '--strict'], {
    cwd: __dirname,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /0 ошибок, 0 предупреждений/);
});
