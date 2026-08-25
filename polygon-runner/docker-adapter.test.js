const test = require('node:test');
const assert = require('node:assert/strict');
const { createDockerAdapter } = require('./docker-adapter.js');

function fakeRunner() {
  const calls = [];
  const processes = [];
  let execCount = 0;
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === 'inspect') return { code: 0, stdout: 'true\n', stderr: '' };
    if (args[0] === 'exec') {
      execCount += 1;
      return { code: execCount === 4 ? 1 : 0, stdout: '', stderr: '' };
    }
    return { code: 0, stdout: 'container-id\n', stderr: '' };
  };
  const spawn = (command, args, options) => {
    const process = {
      command, args, options,
      stdin: { write() {}, end() {} },
      stdout: { on() {} }, stderr: { on() {} },
      on() {}, kill() {}
    };
    processes.push(process);
    return process;
  };
  return { run, spawn, calls, processes };
}

const spec = {
  containerName: 'ipmax-polygon-id-1',
  image: 'ipmax-polygon-linux-permissions:v1',
  network: 'none', memoryBytes: 256 * 1024 * 1024, memorySwapBytes: 256 * 1024 * 1024,
  cpus: 0.5, pidsLimit: 64, readOnly: false,
  capDrop: ['ALL'], capAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID'],
  noNewPrivileges: true, mounts: []
};

test('starts only the allowlisted image with hard resource and privilege limits', async () => {
  const fake = fakeRunner();
  const docker = createDockerAdapter({ run: fake.run, spawn: fake.spawn });
  await docker.createLab(spec);

  const call = fake.calls[0];
  assert.equal(call.command, 'docker');
  assert.deepEqual(call.args, [
    'run', '-d', '--name', 'ipmax-polygon-id-1',
    '--label', 'ipmax.polygon=true',
    '--network', 'none', '--memory', '268435456', '--memory-swap', '268435456',
    '--cpus', '0.5', '--pids-limit', '64',
    '--cap-drop', 'ALL',
    '--cap-add', 'CHOWN', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'FOWNER',
    '--cap-add', 'SETGID', '--cap-add', 'SETUID',
    '--security-opt', 'no-new-privileges:true',
    'ipmax-polygon-linux-permissions:v1'
  ]);
  assert.equal(call.args.includes('-v'), false);
  assert.equal(call.args.includes('--privileged'), false);
});

test('rejects unexpected names, images, mounts or networks before invoking Docker', async () => {
  const cases = [
    { ...spec, containerName: 'evil;rm -rf' },
    { ...spec, image: 'ubuntu:latest' },
    { ...spec, mounts: ['/var/run/docker.sock:/sock'] },
    { ...spec, network: 'bridge' },
    { ...spec, capAdd: [...spec.capAdd, 'SYS_ADMIN'] }
  ];
  for (const candidate of cases) {
    const fake = fakeRunner();
    const docker = createDockerAdapter({ run: fake.run, spawn: fake.spawn });
    await assert.rejects(() => docker.createLab(candidate), /Unsafe polygon lab spec/);
    assert.equal(fake.calls.length, 0);
  }
});

test('runs hidden checks through fixed container commands and normalises booleans', async () => {
  const fake = fakeRunner();
  const docker = createDockerAdapter({ run: fake.run, spawn: fake.spawn });
  const result = await docker.checkLab('ipmax-polygon-id-1', { id: 'linux-permissions-lockout' });

  assert.deepEqual(result.checks, [
    { id: 'directory', passed: true },
    { id: 'config', passed: true },
    { id: 'secret', passed: true },
    { id: 'service', passed: false }
  ]);
  const execCalls = fake.calls.filter(call => call.args[0] === 'exec');
  assert.equal(execCalls.length, 4);
  assert.ok(execCalls.every(call => call.command === 'docker' && call.args[1] === 'ipmax-polygon-id-1'));
  assert.ok(execCalls.every(call => call.args[2] === '/bin/sh' && call.args[3] === '-lc'));
  const serviceCommand = execCalls[3].args[4];
  assert.match(serviceCommand, /e0403fdd8ef7770dcf60fc143e51dc328998e85fa78b0f0989ce0a625236b236/);
  assert.doesNotMatch(serviceCommand, /app\.py\.sha256/);
});

test('opens a non-TTY shell without exposing host command interpolation', () => {
  const fake = fakeRunner();
  const docker = createDockerAdapter({ run: fake.run, spawn: fake.spawn });
  const shell = docker.openShell('ipmax-polygon-id-1');
  assert.equal(shell, fake.processes[0]);
  assert.deepEqual(shell.args, ['exec', '-i', 'ipmax-polygon-id-1', '/bin/sh']);
  assert.deepEqual(shell.options, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
});

test('removes labs idempotently and cleans all labelled orphans', async () => {
  const fake = fakeRunner();
  fake.run = async (command, args, options) => {
    fake.calls.push({ command, args, options });
    if (args[0] === 'ps') return { code: 0, stdout: 'ipmax-polygon-old-1\nipmax-polygon-old-2\nipmax-polygon-' + 'x'.repeat(64) + '\nforeign-labelled-container\n', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
  const docker = createDockerAdapter({ run: fake.run, spawn: fake.spawn });
  await docker.removeLab('ipmax-polygon-id-1');
  const count = await docker.cleanupOrphans();
  assert.equal(count, 2);
  const listing = fake.calls.find(call => call.args[0] === 'ps');
  assert.deepEqual(listing.args, ['ps', '-a', '--filter', 'label=ipmax.polygon=true', '--format', '{{.Names}}']);
  const removals = fake.calls.filter(call => call.args[0] === 'rm');
  assert.deepEqual(removals.map(call => call.args), [
    ['rm', '-f', 'ipmax-polygon-id-1'],
    ['rm', '-f', 'ipmax-polygon-old-1'],
    ['rm', '-f', 'ipmax-polygon-old-2']
  ]);
});
