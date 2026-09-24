import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { BlobServiceClient } from '@azure/storage-blob';
import { TableClient } from '@azure/data-tables';
import { ensureAzurite } from '../helpers/azurite.js';

// End-to-end: the real built form bundle in Chromium talking HTTP to a server
// that runs the real pledgeReceiver handler, backed by Azurite, with emails
// captured by the dry-run. No Vite, no HTTPS, no Functions host — same origin,
// so no CORS either.
const here = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.join(here, '../..');
const root = path.join(functionsDir, '..');
const DIST_HTML = path.join(root, 'dist/index.html');
const PORT = Number(process.env.E2E_PORT || 7099);

const CONNECTION = 'UseDevelopmentStorage=true';
const CONTAINER = 'pledge-submissions-e2e';
const TABLE = 'pledgeaudite2e';
const ADMIN = 'office@e2e.example';
const DEV = 'dev@e2e.example';

let azurite;
let handlePledge;
let server;
let browser;
let emailsDir;
let pageHtml;

const containerClient = () => BlobServiceClient.fromConnectionString(CONNECTION).getContainerClient(CONTAINER);
const tableClient = () => TableClient.fromConnectionString(CONNECTION, TABLE);

function buildBundle() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'ignore' });
}

function formHtml() {
  const config = JSON.stringify({ submitUrl: '/api/pledges', dev: true });
  return readFileSync(DIST_HTML, 'utf8').replace('<head>', `<head>\n<script>window.PLEDGE_CONFIG = ${config};</script>`);
}

async function listen(httpServer) {
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, '127.0.0.1', resolve);
  });
}

async function handleRequest(req, res) {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/index.html'))) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(pageHtml);
      return;
    }
    if (req.method === 'POST' && req.url.startsWith('/api/pledges')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = {};
      for (const [key, value] of Object.entries(req.headers)) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
      const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
        method: 'POST',
        headers,
        body: Buffer.concat(chunks),
      });
      const context = { log() {}, warn() {}, error() {} };
      const result = await handlePledge(request, context);
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.jsonBody ?? {}));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(error?.message || error));
  }
}

before(async () => {
  azurite = await ensureAzurite();

  process.env.AzureWebJobsStorage = CONNECTION;
  delete process.env.AZURE_STORAGE_CONNECTION_STRING;
  process.env.SUBMISSIONS_CONTAINER = CONTAINER;
  process.env.SUBMISSIONS_TABLE = TABLE;
  process.env.EMAIL_SENDER = 'sender@e2e.example';
  process.env.EMAIL_ADMIN = ADMIN;
  process.env.EMAIL_DEV = DEV;
  process.env.EMAIL_ENABLED = 'true';
  delete process.env.PDF_SAVE_DIR;
  emailsDir = await mkdtemp(path.join(os.tmpdir(), 'pledge-e2e-emails-'));
  process.env.EMAIL_SAVE_DIR = emailsDir;

  ({ handlePledge } = await import('../../src/functions/pledgeReceiver.js'));

  buildBundle();
  pageHtml = formHtml();

  server = createServer(handleRequest);
  await listen(server);

  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 900 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
});

after(async () => {
  const { closeBrowser } = await import('../../src/pledgeRender.js');
  await closeBrowser().catch(() => {});
  await browser?.close().catch(() => {});
  await new Promise((resolve) => server?.close(resolve));
  await azurite?.stop();
  await rm(emailsDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const container = containerClient();
  await container.deleteIfExists().catch(() => {});
  await container.createIfNotExists();
  const table = tableClient();
  await table.createTable().catch(() => {});
  for await (const entity of table.listEntities()) {
    await table.deleteEntity(entity.partitionKey, entity.rowKey).catch(() => {});
  }
  for (const file of await readdir(emailsDir)) await rm(path.join(emailsDir, file), { force: true });
});

async function submitForm(query, { beforeSubmit } = {}) {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/${query}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#pledge-form', { timeout: 15000 });
  if (beforeSubmit) await beforeSubmit(page);
  await page.click('#dev-fill');
  // A fast submission is flagged as possible spam (not dropped), so no waiting is needed.
  await page.click('button.submit');
  await page.waitForSelector('.dev-popup-send', { timeout: 5000 });
  await page.click('.dev-popup-send');
  await page.waitForSelector('#submit-success:not([hidden])', { timeout: 15000 });
  return page;
}

async function blobNames() {
  const names = [];
  for await (const blob of containerClient().listBlobsFlat()) names.push(blob.name);
  return names;
}

async function downloadBlob(name) {
  const buffer = await containerClient().getBlockBlobClient(name).downloadToBuffer();
  return buffer.toString('utf8');
}

async function auditRows() {
  const rows = [];
  for await (const entity of tableClient().listEntities()) rows.push(entity);
  return rows;
}

async function savedEmails() {
  const files = await readdir(emailsDir);
  const emails = [];
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    const meta = JSON.parse(await readFile(path.join(emailsDir, file), 'utf8'));
    const bodyFile = file.replace(/\.json$/, '.txt');
    const body = files.includes(bodyFile) ? await readFile(path.join(emailsDir, bodyFile), 'utf8') : '';
    emails.push({ meta, body });
  }
  return emails;
}

test('a family completes the form and the school receives the pledge', async () => {
  const page = await submitForm('?dev=1');
  await page.close();

  const blobs = await blobNames();
  assert.equal(blobs.length, 1);
  const archived = JSON.parse(await downloadBlob(blobs[0]));
  assert.ok(archived.form.parentName, 'archived payload has the form data');
  assert.equal(archived.dev, true);

  const rows = await auditRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Status, 'processed');
  assert.equal(rows[0].EmailSent, 'true');
  // This fill/submit runs immediately; whether or not the backend flags it as a
  // fast submission, it must still be processed and emailed (never dropped).

  const emails = await savedEmails();
  assert.equal(emails.length, 2, 'office notification and parent confirmation');
  assert.ok(emails.some((email) => email.meta.to.includes(DEV)), 'dev submission routed to EMAIL_DEV');
  assert.ok(emails.some((email) => email.meta.attachments.length === 1), 'office email carries the PDF');
});

test('a mid-year start date is pro-rated and included in the submission', async () => {
  const page = await submitForm('?startDate=2027-07-19&dev=1', {
    beforeSubmit: async (open) => {
      await open.waitForSelector('#start-date-summary', { timeout: 15000 });
      const summary = await open.$eval('#start-date-summary', (element) => element.textContent);
      assert.match(summary, /20 of 40/);
    },
  });
  await page.close();

  const blobs = await blobNames();
  assert.equal(blobs.length, 1);
  const archived = JSON.parse(await downloadBlob(blobs[0]));
  assert.equal(archived.startDate, '2027-07-19');
});
