import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

const DEV_PORT = 5173;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
const ROOT_DIR = path.resolve(import.meta.dirname, '..');

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for Vite dev server at ${url}`));
        return;
      }
      setTimeout(check, 250);
    };

    check();
  });
}

const isWin = process.platform === 'win32';
const viteBin = path.join(
  ROOT_DIR,
  'node_modules',
  '.bin',
  isWin ? 'vite.cmd' : 'vite',
);
const electronBin = path.join(
  ROOT_DIR,
  'node_modules',
  '.bin',
  isWin ? 'electron.cmd' : 'electron',
);

const viteProc = spawn(
  viteBin,
  ['--host', '127.0.0.1', '--port', String(DEV_PORT), '--strictPort'],
  {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: isWin,
  },
);

let electronProc = null;
let shuttingDown = false;

function cleanup(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electronProc && !electronProc.killed) {
    electronProc.kill();
  }
  if (!viteProc.killed) {
    viteProc.kill();
  }
  process.exit(exitCode);
}

viteProc.on('exit', (code) => {
  if (!shuttingDown) {
    cleanup(code ?? 1);
  }
});

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));

waitForServer(DEV_URL)
  .then(() => {
    electronProc = spawn(electronBin, ['.'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: isWin,
      env: {
        ...process.env,
        ELECTRON_START_URL: DEV_URL,
      },
    });

    electronProc.on('exit', (code) => {
      cleanup(code ?? 0);
    });
  })
  .catch((err) => {
    console.error(err.message);
    cleanup(1);
  });
