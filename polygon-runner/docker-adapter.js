const { spawn: defaultSpawn } = require('node:child_process');
const { execFile: defaultExecFile } = require('node:child_process');

const ALLOWED_IMAGE = 'ipmax-polygon-linux-permissions:v1';
const ALLOWED_NETWORK = 'none';
const ALLOWED_CAPS = new Set(['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID']);
const EXPECTED_CAPS = ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID'];

const CHECK_COMMANDS = [
  { id: 'directory', command: 'test "$(stat -c %U:%a /etc/anketa)" = "anketa:750"' },
  { id: 'config', command: 'test "$(stat -c %U:%a /etc/anketa/config.ini)" = "anketa:640"' },
  { id: 'secret', command: 'test "$(stat -c %U:%a /etc/anketa/api.key)" = "anketa:600" && su -s /bin/sh -c "test -r /etc/anketa/api.key" anketa' },
  { id: 'service', command: 'test "$(sha256sum /opt/anketa/app.py | cut -d " " -f1)" = "e0403fdd8ef7770dcf60fc143e51dc328998e85fa78b0f0989ce0a625236b236" && test "$(curl -fsS http://127.0.0.1:8080/health)" = "ok" && ! grep -q "Permission denied" /var/log/anketa/anketa.log' }
];

function unsafe() {
  throw new Error('Unsafe polygon lab spec');
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') unsafe();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(String(spec.containerName || ''))) unsafe();
  if (spec.image !== ALLOWED_IMAGE || spec.network !== ALLOWED_NETWORK) unsafe();
  if (spec.memoryBytes !== 256 * 1024 * 1024 || spec.memorySwapBytes !== 256 * 1024 * 1024) unsafe();
  if (spec.cpus !== 0.5 || spec.pidsLimit !== 64) unsafe();
  if (spec.readOnly !== false || spec.noNewPrivileges !== true) unsafe();
  if (!Array.isArray(spec.mounts) || spec.mounts.length !== 0) unsafe();
  if (!Array.isArray(spec.capDrop) || spec.capDrop.length !== 1 || spec.capDrop[0] !== 'ALL') unsafe();
  if (!Array.isArray(spec.capAdd) || spec.capAdd.length !== EXPECTED_CAPS.length ||
      spec.capAdd.some(cap => !ALLOWED_CAPS.has(cap)) ||
      EXPECTED_CAPS.some(cap => !spec.capAdd.includes(cap))) unsafe();
}

function createDockerAdapter(dependencies = {}) {
  const execFile = dependencies.run || ((command, args, options) => new Promise((resolve, reject) => {
    defaultExecFile(command, args, options, (error, stdout, stderr) => {
      if (error) resolve({ code: Number.isInteger(error.code) ? error.code : 1, stdout, stderr });
      else resolve({ code: 0, stdout, stderr });
    });
  }));
  const spawn = dependencies.spawn || defaultSpawn;

  async function run(args) {
    const result = await execFile('docker', args, { windowsHide: true, maxBuffer: 1024 * 1024 });
    if (result.code !== 0) {
      const error = new Error(result.stderr || 'Docker command failed');
      error.code = 'DOCKER_COMMAND_FAILED';
      throw error;
    }
    return result;
  }

  async function createLab(spec) {
    validateSpec(spec);
    const args = [
      'run', '-d', '--name', spec.containerName,
      '--label', 'ipmax.polygon=true',
      '--network', 'none', '--memory', String(spec.memoryBytes), '--memory-swap', String(spec.memorySwapBytes),
      '--cpus', String(spec.cpus), '--pids-limit', String(spec.pidsLimit),
      '--cap-drop', 'ALL',
      ...spec.capAdd.flatMap(cap => ['--cap-add', cap]),
      '--security-opt', 'no-new-privileges:true',
      spec.image
    ];
    await run(args);
    return { containerName: spec.containerName };
  }

  async function inspect(name) {
    const result = await execFile('docker', ['inspect', '--format', '{{.State.Running}}', name], { windowsHide: true });
    return { running: result.code === 0 && String(result.stdout).trim() === 'true' };
  }

  async function checkLab(name, task) {
    if (task.id !== 'linux-permissions-lockout' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name)) unsafe();
    const checks = [];
    for (const item of CHECK_COMMANDS) {
      const result = await execFile('docker', ['exec', name, '/bin/sh', '-lc', item.command], { windowsHide: true });
      checks.push({ id: item.id, passed: result.code === 0 });
    }
    return { checks };
  }

  function openShell(name) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name)) unsafe();
    return spawn('docker', ['exec', '-i', name, '/bin/sh'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  }

  async function removeLab(name) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name)) unsafe();
    const result = await execFile('docker', ['rm', '-f', name], { windowsHide: true });
    if (result.code !== 0 && !/No such container/i.test(String(result.stderr || ''))) {
      const error = new Error(result.stderr || 'Could not remove polygon lab');
      error.code = 'DOCKER_REMOVE_FAILED';
      throw error;
    }
  }

  async function cleanupOrphans() {
    const result = await execFile('docker', ['ps', '-a', '--filter', 'label=ipmax.polygon=true', '--format', '{{.Names}}'], { windowsHide: true });
    if (result.code !== 0) return 0;
    const names = String(result.stdout || '').split(/\r?\n/)
      .map(value => value.trim()).filter(name => /^ipmax-polygon-[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name));
    for (const name of names) await removeLab(name);
    return names.length;
  }

  return { createLab, inspect, checkLab, openShell, removeLab, cleanupOrphans };
}

module.exports = { ALLOWED_IMAGE, CHECK_COMMANDS, createDockerAdapter, validateSpec };
