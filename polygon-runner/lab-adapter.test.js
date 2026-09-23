const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createLabAdapter, validateSpec, waitForLab } = require('./lab-adapter.js');

const spec = {
  containerName: 'ipmax-polygon-test1', image: 'ipmax-polygon-linux-permissions:v2', network: 'none',
  memoryBytes: 256 * 1024 * 1024, memorySwapBytes: 256 * 1024 * 1024,
  cpus: 0.5, pidsLimit: 64, readOnly: false, noNewPrivileges: true,
  mounts: [], capDrop: ['ALL'], capAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID']
};

function fakeLab() {
  const calls = [];
  let active = null;
  const request = async (path, method, body) => {
    calls.push({ path, method, body });
    if (path === '/v1/start') { active = body.name; return { active: true, name: active }; }
    if (path === '/v1/status') return { active: !!active, name: active };
    if (path === '/v1/stop') { active = null; return { active: false }; }
    if (path === '/v1/check') return { checks: [
      { id: 'directory', passed: true }, { id: 'config', passed: true },
      { id: 'secret', passed: true }, { id: 'service', passed: false }
    ] };
    throw new Error('Unexpected route');
  };
  const socket = new EventEmitter();
  socket.destroy = () => {};
  socket.write = () => {};
  const adapter = createLabAdapter({ request, connect: () => socket });
  return { calls, adapter, socket };
}

test('permits only the fixed lab spec and rejects images, mounts, networks and capabilities', () => {
  assert.doesNotThrow(() => validateSpec(spec));
  for (const changed of [
    { image: 'ubuntu:latest' }, { mounts: ['/var/run/docker.sock:/sock'] },
    { network: 'host' }, { capAdd: [...spec.capAdd, 'SYS_ADMIN'] },
    { containerName: 'other-container' }, { memoryBytes: 1024 }
  ]) assert.throws(() => validateSpec({ ...spec, ...changed }), /Unsafe polygon lab spec/);
});

test('the adapter uses only narrow lab operations and never forwards a Docker request', async () => {
  const { adapter, calls } = fakeLab();
  assert.deepEqual(await adapter.createLab(spec), { containerName: spec.containerName });
  assert.deepEqual(await adapter.inspect(spec.containerName), { running: true });
  assert.deepEqual((await adapter.checkLab(spec.containerName, { id: 'linux-permissions-lockout' })).checks.map(x => x.passed), [true, true, true, false]);
  assert.deepEqual(await adapter.removeLab(spec.containerName), undefined);
  assert.equal(await adapter.cleanupOrphans(), 0);
  assert.deepEqual(calls.map(call => call.path), ['/v1/start', '/v1/status', '/v1/check', '/v1/stop', '/v1/status']);
  assert.deepEqual(calls[0].body, { name: spec.containerName });
  assert.ok(calls.every(call => !JSON.stringify(call).includes('/containers/create')));
});

test('terminal opens only for the current lab and closes its socket', async () => {
  const { adapter, socket } = fakeLab();
  assert.throws(() => adapter.openShell(spec.containerName), /Unsafe polygon lab spec/);
  await adapter.createLab(spec);
  const terminal = adapter.openShell(spec.containerName);
  assert.equal(terminal.stdin, socket);
  assert.equal(terminal.stdout, socket);
  assert.equal(terminal.stderr, null);
  assert.throws(() => adapter.openShell('ipmax-polygon-other'), /Unsafe polygon lab spec/);
});

test('runner waits for a lab that becomes reachable during Compose startup', async () => {
  let calls = 0;
  const delays = [];
  const adapter = { cleanupOrphans: async () => {
    if (++calls < 3) throw new Error('Lab DNS not ready');
    return 1;
  } };
  assert.equal(await waitForLab(adapter, { attempts: 4, sleep: async ms => delays.push(ms) }), 1);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 1000]);

  await assert.rejects(
    waitForLab({ cleanupOrphans: async () => { throw new Error('Lab unavailable'); } },
      { attempts: 2, sleep: async () => {} }),
    /Lab unavailable/
  );
});
