import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '../../src/form-definition.js');
const target = path.join(here, '../src/formDefinition.js');

const banner = [
  '// GENERATED FILE — do not edit directly.',
  '// Synced from ../../src/form-definition.js by scripts/sync-form-definition.js (`npm run sync:config`).',
  '// The sync runs automatically on `npm start`. Edit the source file and re-run to regenerate.',
  '',
].join('\n');

writeFileSync(target, banner + readFileSync(source, 'utf8'), 'utf8');
console.log(`Synced form definition: ${source} -> ${target}`);
