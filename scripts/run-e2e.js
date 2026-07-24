const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const serverUrl = 'http://127.0.0.1:4173/';

function waitForServer(attempts = 50) {
  return new Promise((resolve, reject) => {
    const probe = remaining => {
      const request = http.get(serverUrl, response => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
        } else if (remaining > 0) {
          setTimeout(() => probe(remaining - 1), 100);
        } else {
          reject(new Error(`Test server returned ${response.statusCode}`));
        }
      });

      request.on('error', error => {
        if (remaining > 0) {
          setTimeout(() => probe(remaining - 1), 100);
        } else {
          reject(error);
        }
      });
    };

    probe(attempts);
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
}

function stopServer(server) {
  return new Promise(resolve => {
    let finished = false;
    let forceStop;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceStop);
      resolve();
    };

    server.once('exit', finish);
    if (server.exitCode !== null || server.signalCode !== null) {
      finish();
      return;
    }

    forceStop = setTimeout(() => {
      server.kill('SIGKILL');
      finish();
    }, 2000);
    if (!server.kill('SIGTERM')) finish();
  });
}

async function main() {
  const server = spawn(process.execPath, ['test-server.js'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, IPMAX_AI_PROVIDER: 'mock' }
  });

  try {
    await waitForServer();
    const playwrightCli = require.resolve('@playwright/test/cli');
    const result = await run(process.execPath, [playwrightCli, 'test', '--reporter=line'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, IPMAX_EXTERNAL_SERVER: '1' }
    });

    if (result.code !== 0) {
      process.exitCode = result.code === null ? 1 : result.code;
    }
  } finally {
    await stopServer(server);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
