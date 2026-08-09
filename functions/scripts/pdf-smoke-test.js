import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPledgePdf, closeBrowser } from '../src/pledgeRender.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(readFileSync(path.join(here, '../../src/example-data.json'), 'utf8'));
const pledge = { ...example.form, submittedAt: example.submittedAt, timeOnPageMs: example.timeOnPageMs };

try {
  const pdf = await buildPledgePdf(pledge);
  if (!pdf.length) throw new Error('PDF build produced an empty document');
  console.log(`PDF smoke test passed (${pdf.length} bytes)`);
} finally {
  await closeBrowser();
}
