import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '../../dist/index.html');
const target = path.join(here, '../src/pledgeForm.html');

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, readFileSync(source, 'utf8'), 'utf8');
console.log(`Synced form bundle: ${source} -> ${target}`);
