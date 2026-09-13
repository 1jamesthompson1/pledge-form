import { execFileSync } from 'node:child_process';

const app = process.env.AZURE_FUNCTIONAPP_NAME;
if (!app) {
  console.error('AZURE_FUNCTIONAPP_NAME is not set. Add it to .env (see .env.example).');
  process.exit(1);
}
const healthUrl = process.env.PLEDGE_HEALTH_URL || `https://${app}.azurewebsites.net/api/health`;

const expectedCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

let health;
try {
  const response = await fetch(healthUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  health = await response.json();
} catch (error) {
  console.error(`FAIL: could not reach the deployed function at ${healthUrl} (${error.message}).`);
  process.exit(1);
}

if (health.formCommit !== expectedCommit) {
  console.error(
    `FAIL: deployed function is at commit ${health.formCommit || 'unknown'} `
      + `(formVersion ${health.formVersion || 'unknown'}), but the latest commit is ${expectedCommit}.`,
  );
  console.error(`Deploy it first: npx func azure functionapp publish ${app}`);
  process.exit(1);
}

console.log(
  `OK: deployed function is at the latest commit ${expectedCommit} (formVersion ${health.formVersion || 'unknown'}).`,
);
