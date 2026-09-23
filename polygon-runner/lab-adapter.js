const http = require('node:http');
const net = require('node:net');

const ALLOWED_IMAGE = 'ipmax-polygon-linux-permissions:v2';
const LAB_NAME = /^ipmax-polygon-[a-zA-Z0-9][a-zA-Z0-9_.-]{0,39}$/;
const EXPECTED_CAPS = ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID'];
const CHECK_IDS = ['directory', 'config', 'secret', 'service'];

function unsafe() { throw new Error('Unsafe polygon lab spec'); }

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || !LAB_NAME.test(String(spec.containerName || ''))) unsafe();
  if (spec.image !== ALLOWED_IMAGE || spec.network !== 'none') unsafe();
  if (spec.memoryBytes !== 256 * 1024 * 1024 || spec.memorySwapBytes !== 256 * 1024 * 1024) unsafe();
  if (spec.cpus !== 0.5 || spec.pidsLimit !== 64 || spec.readOnly !== false || spec.noNewPrivileges !== true) unsafe();
  if (!Array.isArray(spec.mounts) || spec.mounts.length !== 0) unsafe();
  if (!Array.isArray(spec.capDrop) || spec.capDrop.length !== 1 || spec.capDrop[0] !== 'ALL') unsafe();
  if (!Array.isArray(spec.capAdd) || spec.capAdd.length !== EXPECTED_CAPS.length ||
      EXPECTED_CAPS.some(cap => !spec.capAdd.includes(cap))) unsafe();
}

function createLabAdapter(options = {}) {
  const host = options.host || process.env.POLYGON_LAB_HOST || 'polygon-lab';
  const controlPort = Number(options.controlPort || process.env.POLYGON_LAB_CONTROL_PORT || 4181);
  const terminalPort = Number(options.terminalPort || process.env.POLYGON_LAB_TERMINAL_PORT || 4182);
  const requestImpl = options.request || ((route, method, body) => new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ hostname: host, port: controlPort, path: route, method, timeout: 5000,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; if (text.length > 8192) req.destroy(); });
      response.on('end', () => {
        if (response.statusCode >= 400) return reject(new Error('Lab service rejected request'));
        try { resolve(JSON.parse(text)); } catch (_) { reject(new Error('Invalid lab service response')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Lab service timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  }));
  const connect = options.connect || ((port, address) => net.connect({ port, host: address }));
  let currentName = null;

  async function createLab(spec) {
    validateSpec(spec);
    const result = await requestImpl('/v1/start', 'POST', { name: spec.containerName });
    if (!result.active || result.name !== spec.containerName) throw new Error('Lab service did not start');
    currentName = spec.containerName;
    return { containerName: spec.containerName };
  }

  async function inspect(name) {
    if (!LAB_NAME.test(String(name || ''))) unsafe();
    const result = await requestImpl('/v1/status', 'GET');
    return { running: result.active === true && result.name === name };
  }

  async function checkLab(name, task) {
    if (!LAB_NAME.test(String(name || '')) || task?.id !== 'linux-permissions-lockout') unsafe();
    const result = await requestImpl('/v1/check', 'POST', { name });
    if (!Array.isArray(result.checks) || result.checks.length !== CHECK_IDS.length ||
        result.checks.some((item, index) => item.id !== CHECK_IDS[index] || typeof item.passed !== 'boolean')) {
      throw new Error('Invalid lab check response');
    }
    return result;
  }

  function openShell(name) {
    if (!LAB_NAME.test(String(name || '')) || name !== currentName) unsafe();
    const socket = connect(terminalPort, host);
    socket.on('error', () => socket.destroy());
    return { stdin: socket, stdout: socket, stderr: null,
      once: (event, handler) => socket.once(event, handler),
      kill: () => socket.destroy() };
  }

  async function removeLab(name) {
    if (!LAB_NAME.test(String(name || ''))) unsafe();
    await requestImpl('/v1/stop', 'POST', { name });
    if (currentName === name) currentName = null;
  }

  async function cleanupOrphans() {
    const result = await requestImpl('/v1/status', 'GET');
    if (!result.active) return 0;
    if (!LAB_NAME.test(String(result.name || ''))) throw new Error('Unknown lab state');
    await removeLab(result.name);
    return 1;
  }

  return { createLab, inspect, checkLab, openShell, removeLab, cleanupOrphans };
}

module.exports = { ALLOWED_IMAGE, CHECK_IDS, createLabAdapter, validateSpec };
