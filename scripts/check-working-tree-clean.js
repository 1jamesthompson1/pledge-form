import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (process.env.PLEDGE_ALLOW_DIRTY === '1') {
  console.warn('WARNING: skipping clean working tree check (PLEDGE_ALLOW_DIRTY=1 set).');
  process.exit(0);
}

let status;
try {
  status = execSync('git status --porcelain', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (error) {
  console.error('Could not run `git status`: ' + (error.message || error));
  process.exit(1);
}

if (status.trim()) {
  console.error('ERROR: refusing to proceed with a dirty working tree.');
  console.error('Commit or stash every change first so the form that gets built/deployed is exactly the committed version.');
  console.error('');
  console.error(status.trimEnd());
  process.exit(1);
}

console.log('OK: working tree is clean (deployed form will match the committed version).');
