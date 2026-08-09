import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '../../src/pledge-config.js');
const target = path.join(here, '../src/pledgeConfig.js');

const banner = [
  '// GENERATED FILE — do not edit directly.',
  '// Synced from ../../src/pledge-config.js by scripts/sync-config.js (`npm run sync:config`).',
  '// The sync runs automatically on `npm start`. Edit the source file and re-run to regenerate.',
  '',
].join('\n');

writeFileSync(target, banner + readFileSync(source, 'utf8'), 'utf8');
console.log(`Synced pledge config: ${source} -> ${target}`);
