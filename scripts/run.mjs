import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const host = process.env.HOST ?? '127.0.0.1';
const port = process.env.PORT ?? '5360';
const backendPort = process.env.DMV_BACKEND_PORT ?? '8080';
const dataDir = process.env.NYPL8_DATA_DIR ?? 'data';
const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
const url = `http://${displayHost}:${port}`;

// Build on first run so `just run` works without a separate step.
if (!existsSync(new URL('../.next/BUILD_ID', import.meta.url))) {
  console.log('No build found — building the dashboard first…');
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const backend = spawn(process.execPath, ['backend/server.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: backendPort },
});

const nextBin = fileURLToPath(new URL('../node_modules/.bin/next', import.meta.url));
const frontend = spawn(nextBin, ['start', '--hostname', host, '--port', port], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    DMV_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
    NYPL8_DATA_DIR: dataDir,
  },
});

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

function openBrowser(target) {
  if (process.env.NYPL8_NO_OPEN) return;
  try {
    if (process.platform === 'darwin') {
      spawn('open', [target], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', target], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [target], { stdio: 'ignore', detached: true }).unref();
    }
  } catch {
    // A missing opener is not fatal; the URL is printed below.
  }
}

async function openWhenReady(target) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) {
        console.log(`\nnypl8 is running at ${target}`);
        openBrowser(target);
        return;
      }
    } catch {
      // Server not up yet; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

void openWhenReady(url);
