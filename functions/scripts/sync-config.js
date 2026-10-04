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

// The built form advertises the version it was built from in a meta tag (see
// vite.config.js). Read it back rather than trusting package.json, so the
// version we report always describes the bundle that is actually rendered.
function extractBundleVersion(html) {
  const match = html.match(/<meta name="form-version" content="([^"]+)"\s*\/?>/i);
  if (!match) {
    throw new Error(
      'The built form has no <meta name="form-version"> marker. '
      + 'The build is stale or did not complete; re-run `npm run build` in the repo root.',
    );
  }
  return match[1];
}

mkdirSync(targetDir, { recursive: true });

// 1. Rebuild the form bundle from source. `dist/` is gitignored and was
//    previously only rebuilt by hand, which let the backend keep rendering the
//    previous release's bundle after a version bump. Building here makes the
//    rendered form and the reported version impossible to desync.
execSync('npm run build', { cwd: root, stdio: 'inherit' });
const bundleSource = path.join(root, 'dist/index.html');
const bundle = readFileSync(bundleSource, 'utf8');
const bundleVersion = extractBundleVersion(bundle);
if (bundleVersion !== rootPkg.version) {
  throw new Error(
    `The built form is version ${bundleVersion} but package.json is ${rootPkg.version}. `
    + 'Refusing to sync a form that does not match the released version.',
  );
}

// 2. Record the version of the bundle we are about to ship, not package.json.
writeFileSync(
  path.join(targetDir, 'formVersion.js'),
  `${banner('the built form bundle (dist/index.html)', '// This records the version of the form bundle this function renders into PDFs.')}`
    + `export const formVersion = ${JSON.stringify(bundleVersion)};\n`
    + `export const formCommit = ${JSON.stringify(commit)};\n`,
  'utf8',
);

// 3. Keep the function package in lockstep with the form release so there is one version number.
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

// 3 & 4. Form pricing rules and form definition.
syncModule('../../src/pledge-config.js', 'pledge-config.js', 'pledgeConfig.js');
syncModule('../../src/form-definition.js', 'form-definition.js', 'formDefinition.js');

// 5. The rendered form bundle, used to build the PDF (a straight copy, no banner).
const bundleTarget = path.join(targetDir, 'pledgeForm.html');
writeFileSync(bundleTarget, bundle, 'utf8');
console.log(`Synced dist/index.html (v${bundleVersion}) -> pledgeForm.html`);

console.log(`Synced form version ${bundleVersion}${commit ? ` (${commit})` : ''}`);
