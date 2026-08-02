import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hostIndex = process.argv.indexOf('--host');
const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : '127.0.0.1';
const frontendPort = process.env.PORT ?? '5360';
const backendPort = process.env.DMV_BACKEND_PORT ?? '8080';

const install = spawnSync(
  'npm',
  ['--prefix', 'backend', 'install', '--omit=dev', '--no-audit', '--no-fund'],
  { cwd: root, stdio: 'inherit' },
);
if (install.error) throw install.error;
if (install.status !== 0) process.exit(install.status ?? 1);

const common = { cwd: root, stdio: 'inherit' };
const backend = spawn(process.execPath, ['backend/server.mjs'], {
  ...common,
  env: { ...process.env, HOST: '127.0.0.1', PORT: backendPort },
});
const frontend = spawn(
  fileURLToPath(new URL('../node_modules/.bin/next', import.meta.url)),
  ['dev', '--hostname', host, '--port', frontendPort],
  {
    ...common,
    env: {
      ...process.env,
      DMV_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
    },
  },
);

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  backend.kill(signal);
  frontend.kill(signal);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal));
}
for (const child of [backend, frontend]) {
  child.on('error', (error) => {
    console.error(error);
    stop();
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      stop();
      process.exitCode = code ?? (signal ? 1 : 0);
    }
  });
}
