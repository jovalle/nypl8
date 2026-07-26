import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('1/3  Installing dashboard dependencies…');
run('npm', ['install', '--no-audit', '--no-fund']);

console.log('2/3  Installing DMV lookup dependencies…');
run('npm', ['install', '--prefix', 'backend', '--omit=dev', '--no-audit', '--no-fund']);

console.log('3/3  Building the dashboard…');
run('npm', ['run', 'build']);

console.log('\nSetup complete. Start the tool with:  just run   (or:  npm start)');
