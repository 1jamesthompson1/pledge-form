import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.join(here, '../..');
const root = path.join(functionsDir, '..');

async function importOrNull(specifier) {
  try {
    return await import(specifier);
  } catch {
    return null;
  }
}

test('backend pledgeConfig matches the frontend source', async () => {
  const front = await import(path.join(root, 'src/pledge-config.js'));
  const back = await importOrNull(path.join(functionsDir, 'src/pledgeConfig.js'));
  assert.ok(back, 'functions/src/pledgeConfig.js is missing — run `npm run sync:config` in functions/');
  assert.deepEqual(back.pledgeRules, front.pledgeRules);
  assert.equal(back.money(1234.5), front.money(1234.5));
});

test('backend formDefinition matches the frontend source', async () => {
  const front = await import(path.join(root, 'src/form-definition.js'));
  const back = await importOrNull(path.join(functionsDir, 'src/formDefinition.js'));
  assert.ok(back, 'functions/src/formDefinition.js is missing — run `npm run sync:config` in functions/');

  for (const key of [
    'sections', 'consentGroups', 'eotcStatementsSchool', 'eotcStatementsKindergarten',
    'eotcWalksKindergarten', 'eotcLegends', 'labels',
  ]) {
    assert.deepEqual(back[key], front[key], `${key} differs between the form and the backend copy`);
  }

  // Interpolated text is what the office email prints, so compare behaviour too.
  const vars = { year: 2027, schoolName: 'School', child: 'child', theirFace: 'their face is', pronoun: 'We', pronounLower: 'we', possessive: 'our', objectPronoun: 'us', beVerb: 'are' };
  for (const statement of front.eotcStatementsSchool) {
    assert.equal(back.interpolate(statement, vars), front.interpolate(statement, vars));
  }
  assert.equal(back.childWord(2), front.childWord(2));
  assert.equal(back.theirFacePhrase(1), front.theirFacePhrase(1));
});

test('backend formVersion matches the released package version', async () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = await importOrNull(path.join(functionsDir, 'src/formVersion.js'));
  assert.ok(version, 'functions/src/formVersion.js is missing — run `npm run sync:config` in functions/');
  assert.equal(version.formVersion, pkg.version);
});

test('backend pledgeForm bundle matches the built form', async () => {
  const built = path.join(root, 'dist/index.html');
  const copied = path.join(functionsDir, 'src/pledgeForm.html');
  if (!existsSync(built)) {
    // A fresh checkout has no dist build; the PDF smoke test and CI cover this.
    return;
  }
  assert.ok(existsSync(copied), 'functions/src/pledgeForm.html is missing — run `npm run sync:config` in functions/');
  assert.equal(readFileSync(copied, 'utf8'), readFileSync(built, 'utf8'));
});
