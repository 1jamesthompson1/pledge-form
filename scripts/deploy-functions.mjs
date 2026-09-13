import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const functionsDir = path.join(root, 'functions');
const appName = process.env.AZURE_FUNCTIONAPP_NAME;

if (!appName) {
  console.error('AZURE_FUNCTIONAPP_NAME is not set. Add it to .env (see .env.example).');
  process.exit(1);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`Command failed: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

// `func publish` authenticates through the Azure CLI; fail early with a clear message.
const auth = spawnSync('az', ['account', 'get-access-token', '--resource', 'https://management.core.windows.net/', '-o', 'none'], { stdio: 'ignore' });
if (auth.error || auth.status !== 0) {
  console.error('Azure CLI is not signed in (or the token has expired).');
  console.error('Run: az login --scope https://management.core.windows.net//.default');
  process.exit(1);
}

run('npm', ['run', 'sync:config'], functionsDir);
run('npm', ['test'], functionsDir);
run('npx', ['func', 'azure', 'functionapp', 'publish', appName], functionsDir);

// Wait until the new build is actually serving before handing back to the release.
const expectedCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const healthUrl = process.env.PLEDGE_HEALTH_URL || `https://${appName}.azurewebsites.net/api/health`;
let live = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch(healthUrl);
    if (response.ok) {
      const health = await response.json();
      if (health.formCommit === expectedCommit) { live = true; break; }
    }
  } catch {
    // Not responding yet; keep waiting.
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (!live) {
  console.error(`Published, but ${healthUrl} has not reported commit ${expectedCommit} yet.`);
  process.exit(1);
}

console.log(`Deployed functions to ${appName} (${expectedCommit})`);
