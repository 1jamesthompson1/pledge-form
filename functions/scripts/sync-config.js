import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const sourceDir = path.join(root, 'src');
const targetDir = path.join(here, '../src');

function banner(sourceDescription, note) {
  return [
    '// GENERATED FILE — do not edit directly.',
    `// Synced from ${sourceDescription} by scripts/sync-config.js (\`npm run sync:config\`).`,
    ...(note ? [note] : []),
    '// The sync runs automatically on `npm start`. Edit the source and re-run to regenerate.',
    '',
  ].join('\n');
}

function syncModule(sourceDescription, sourceName, targetName) {
  const source = path.join(sourceDir, sourceName);
  const target = path.join(targetDir, targetName);
  writeFileSync(target, banner(sourceDescription) + readFileSync(source, 'utf8'), 'utf8');
  console.log(`Synced ${sourceName} -> ${targetName}`);
}

const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  commit = '';
}

// 1. Version: the form release this function build is designed to work with.
mkdirSync(targetDir, { recursive: true });
writeFileSync(
  path.join(targetDir, 'formVersion.js'),
  `${banner('the root package.json', '// This records which pledge-form release this function build is designed to work with.')}`
    + `export const formVersion = ${JSON.stringify(rootPkg.version)};\n`
    + `export const formCommit = ${JSON.stringify(commit)};\n`,
  'utf8',
);

// Keep the function package in lockstep with the form release so there is one version number.
const functionPkgPath = path.join(here, '../package.json');
const functionPkg = JSON.parse(readFileSync(functionPkgPath, 'utf8'));
if (functionPkg.version !== rootPkg.version) {
  functionPkg.version = rootPkg.version;
  writeFileSync(functionPkgPath, `${JSON.stringify(functionPkg, null, 2)}\n`, 'utf8');
  console.log(`Synced functions/package.json version -> ${rootPkg.version}`);
}

try {
  const lockPath = path.join(here, '../package-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  let changed = false;
  if (lock.version !== rootPkg.version) { lock.version = rootPkg.version; changed = true; }
  if (lock.packages && lock.packages[''] && lock.packages[''].version !== rootPkg.version) {
    lock.packages[''].version = rootPkg.version;
    changed = true;
  }
  if (changed) {
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    console.log(`Synced functions/package-lock.json version -> ${rootPkg.version}`);
  }
} catch {
  // No lockfile to sync.
}

// 2 & 3. Form pricing rules and form definition.
syncModule('../../src/pledge-config.js', 'pledge-config.js', 'pledgeConfig.js');
syncModule('../../src/form-definition.js', 'form-definition.js', 'formDefinition.js');

// 4. The rendered form bundle, used to build the PDF (a straight copy, no banner).
const bundleSource = path.join(root, 'dist/index.html');
const bundleTarget = path.join(targetDir, 'pledgeForm.html');
writeFileSync(bundleTarget, readFileSync(bundleSource, 'utf8'), 'utf8');
console.log(`Synced dist/index.html -> ${bundleTarget}`);

console.log(`Synced form version ${rootPkg.version}${commit ? ` (${commit})` : ''}`);
