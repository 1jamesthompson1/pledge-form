import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, rm, mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlobServiceClient } from '@azure/storage-blob';
import { TableClient } from '@azure/data-tables';
import { ensureAzurite } from '../helpers/azurite.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '../../..');
const CURRENT_VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const CONNECTION = 'UseDevelopmentStorage=true';
const CONTAINER = 'pledge-submissions-test';
const TABLE = 'pledgeaudittest';
const ADMIN = 'office@test.example';
const DEV = 'dev@test.example';

let azurite;
let handlePledge;
let emailsDir;

const containerClient = () => BlobServiceClient.fromConnectionString(CONNECTION).getContainerClient(CONTAINER);
const tableClient = () => TableClient.fromConnectionString(CONNECTION, TABLE);

before(async () => {
  azurite = await ensureAzurite();

  process.env.AzureWebJobsStorage = CONNECTION;
  delete process.env.AZURE_STORAGE_CONNECTION_STRING;
  process.env.SUBMISSIONS_CONTAINER = CONTAINER;
  process.env.SUBMISSIONS_TABLE = TABLE;
  process.env.EMAIL_SENDER = 'sender@test.example';
  process.env.EMAIL_ADMIN = ADMIN;
  process.env.EMAIL_DEV = DEV;
  process.env.EMAIL_ENABLED = 'false';
  delete process.env.PDF_SAVE_DIR;
  emailsDir = await mkdtemp(path.join(os.tmpdir(), 'pledge-emails-'));
  process.env.EMAIL_SAVE_DIR = emailsDir;

  // Imported after the environment is in place, so the modules read it.
  ({ handlePledge } = await import('../../src/functions/pledgeReceiver.js'));
});

after(async () => {
  try {
    const { closeBrowser } = await import('../../src/pledgeRender.js');
    await closeBrowser();
  } catch { /* Browser never launched. */ }
  await azurite?.stop();
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

  for (const file of await readdir(emailsDir)) {
    await rm(path.join(emailsDir, file), { force: true });
  }
});

function pledgePayload(overrides = {}) {
  return {
    parentName: 'Test Parent',
    email: 'parent@test.example',
    otherParentEmail: '',
    familyType: 'split',
    schoolChildCount: 1,
    kindergartenChildCount: 0,
    school1Name: 'Child One',
    school1Class: '3',
    school1Amount: 4250,
    school1Disbursement: 400,
    signature: 'Test Parent',
    signatureDate: '2027-02-02',
    timeOnPageMs: 30000,
    ...overrides,
  };
}

async function post(payload, { raw, email = false, deps } = {}) {
  process.env.EMAIL_ENABLED = email ? 'true' : 'false';
  const logs = { log: [], warn: [], error: [] };
  const context = {
    log: (message) => logs.log.push(String(message)),
    warn: (message) => logs.warn.push(String(message)),
    error: (message) => logs.error.push(String(message)),
  };
  const request = new Request('http://localhost:7071/api/pledges', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    body: raw ?? JSON.stringify(payload),
  });
  const result = await handlePledge(request, context, deps);
  return { result, logs };
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
    emails.push({ meta, body, file });
  }
  return emails;
}

async function blobNames() {
  const names = [];
  for await (const blob of containerClient().listBlobsFlat()) names.push(blob.name);
  return names;
}

test('rejects a submission missing required fields', async () => {
  const { result } = await post(pledgePayload({ parentName: '' }));
  assert.equal(result.status, 400);
  assert.match(result.jsonBody.error, /Validation failed/);
  assert.ok(result.jsonBody.details.some((detail) => /parentName/.test(detail)));
});

test('rejects a submission with no children', async () => {
  const { result } = await post(pledgePayload({ schoolChildCount: 0, kindergartenChildCount: 0 }));
  assert.equal(result.status, 400);
  assert.ok(result.jsonBody.details.some((detail) => /At least one child/.test(detail)));
});

test('rejects more children than the form allows', async () => {
  const { result } = await post(pledgePayload({ schoolChildCount: 6 }));
  assert.equal(result.status, 400);
  assert.ok(result.jsonBody.details.some((detail) => /schoolChildCount must be/.test(detail)));
});

test('rejects an invalid email address', async () => {
  const { result } = await post(pledgePayload({ email: 'not-an-email' }));
  assert.equal(result.status, 400);
  assert.ok(result.jsonBody.details.some((detail) => /Invalid email/.test(detail)));
});

test('flags but does not drop a honeypot submission', async () => {
  const { result } = await post(pledgePayload({ website: 'http://spam.example' }), { email: true });
  assert.equal(result.status, 200);
  const row = (await auditRows())[0];
  assert.equal(row.Status, 'processed');
  assert.equal(row.EmailSent, 'true');
  assert.equal(row.Suspect, 'true');
  assert.match(row.SpamReason, /honeypot/);
  assert.equal((await blobNames()).length, 1, 'the raw body is still archived');

  const office = (await savedEmails()).find((email) => email.meta.to.includes(ADMIN));
  assert.ok(office, 'a honeypot submission must still reach the office');
  assert.match(office.meta.subject, /\[POSSIBLE SPAM\]/);
  assert.match(office.body, /honeypot field was filled/);
});

test('flags but does not drop a submission completed too quickly', async () => {
  const { result } = await post(pledgePayload({ timeOnPageMs: 100 }), { email: true });
  assert.equal(result.status, 200);
  const row = (await auditRows())[0];
  assert.equal(row.Status, 'processed');
  assert.equal(row.EmailSent, 'true');
  assert.equal(row.Suspect, 'true');
  assert.match(row.SpamReason, /under 5000ms/);

  const office = (await savedEmails()).find((email) => email.meta.to.includes(ADMIN));
  assert.ok(office, 'a suspect submission must still reach the office');
  assert.match(office.meta.subject, /\[POSSIBLE SPAM\]/);
  assert.match(office.body, /POSSIBLE SPAM/);
});

test('flags a submission with no fill time instead of dropping it', async () => {
  const { result } = await post(pledgePayload({ timeOnPageMs: undefined }), { email: true });
  assert.equal(result.status, 200);
  const row = (await auditRows())[0];
  assert.equal(row.Status, 'processed');
  assert.equal(row.Suspect, 'true');
  assert.match(row.SpamReason, /no time-on-page/);
});

test('handles malformed JSON and records it on the audit row', async () => {
  const { result } = await post(null, { raw: '{ this is not json' });
  assert.equal(result.status, 400);
  assert.match(result.jsonBody.error, /Invalid JSON/);
  const rows = await auditRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Status, 'invalid-json');
  assert.equal(rows[0].Errors, 'Invalid JSON payload');
});

test('rejects a body larger than 2 MB', async () => {
  const oversized = JSON.stringify(pledgePayload({ pledgeComments: 'x'.repeat(2 * 1024 * 1024 + 100) }));
  const { result } = await post(null, { raw: oversized });
  assert.equal(result.status, 413);
});

test('archives a valid submission and marks the audit row processed', async () => {
  const { result } = await post(pledgePayload({ formVersion: CURRENT_VERSION }), { email: false });
  assert.equal(result.status, 200);
  assert.equal(result.jsonBody.confirmationEmailSent, undefined, 'no email attempt when email is disabled');

  const rows = await auditRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Status, 'processed');
  assert.equal(rows[0].VersionMismatch, 'false');
  assert.equal(rows[0].Suspect, 'false');

  const blobs = await blobNames();
  assert.equal(blobs.length, 1);
  assert.match(blobs[0], /^pledge-.*\.json$/);

  assert.equal((await savedEmails()).length, 0, 'no email is sent when EMAIL_ENABLED is false');
});

test('sends the office notification email with the PDF attached', async () => {
  const { result } = await post(pledgePayload({ formVersion: CURRENT_VERSION }), { email: true });
  assert.equal(result.status, 200);
  assert.equal(result.jsonBody.confirmationEmailSent, true);

  const office = (await savedEmails()).filter((email) => email.meta.to.includes(ADMIN));
  assert.equal(office.length, 1, 'exactly one office notification');
  const [notification] = office;
  assert.equal(notification.meta.from, 'sender@test.example');
  assert.deepEqual(notification.meta.replyTo, ['parent@test.example'], 'replies go to the parent');
  assert.match(notification.meta.subject, /New pledge submission from Test Parent/);

  assert.equal(notification.meta.attachments.length, 1);
  assert.equal(notification.meta.attachments[0].contentType, 'application/pdf');
  assert.ok(notification.meta.attachments[0].bytes > 1000, 'PDF attachment should not be empty');

  assert.match(notification.body, /School children:/);
  assert.match(notification.body, /Child One/);
  assert.match(notification.body, /Total pledge/);
});

test('sends the parent confirmation to every valid parent address', async () => {
  const { result } = await post(
    pledgePayload({ otherParentEmail: 'other-parent@test.example', formVersion: CURRENT_VERSION }),
    { email: true },
  );
  assert.equal(result.status, 200);

  const confirmations = (await savedEmails()).filter((email) => /We have received your .* pledge/.test(email.meta.subject));
  assert.equal(confirmations.length, 1, 'exactly one parent confirmation');
  const [confirmation] = confirmations;
  assert.deepEqual(
    [...confirmation.meta.to].sort(),
    ['other-parent@test.example', 'parent@test.example'].sort(),
    'both parents are addressed',
  );
  assert.equal(confirmation.meta.from, 'sender@test.example');
  assert.deepEqual(confirmation.meta.replyTo, [ADMIN], 'replies go to the office');
  assert.equal(confirmation.meta.attachments.length, 0, 'the confirmation carries no PDF');
  assert.match(confirmation.body, /Kia ora Test Parent/);
  assert.match(confirmation.body, /Child One/);
});

test('warns the parent when the confirmation email cannot be sent', async () => {
  const { result } = await post(pledgePayload(), {
    email: true,
    deps: { sendParentConfirmation: async () => { throw new Error('550 mailbox unavailable'); } },
  });

  assert.equal(result.status, 200, 'the office still received the pledge');
  assert.equal(result.jsonBody.confirmationEmailSent, false);
  assert.match(result.jsonBody.warning, /could not be sent/);
  assert.match(result.jsonBody.warning, /parent@test\.example/);

  const row = (await auditRows())[0];
  assert.equal(row.Status, 'processed');
  assert.equal(row.EmailSent, 'true');
  assert.equal(row.ParentEmailSent, 'false');
  assert.match(row.ParentEmailError, /mailbox unavailable/);

  const office = (await savedEmails()).find((email) => email.meta.to.includes(ADMIN));
  assert.ok(office, 'the office email is still sent');
});

test('routes dev submissions to EMAIL_DEV and flags a version mismatch', async () => {
  const { result } = await post(pledgePayload({ dev: true, formVersion: '0.0.0' }), { email: true });
  assert.equal(result.status, 200);

  const rows = await auditRows();
  assert.equal(rows[0].Dev, 'true');
  assert.equal(rows[0].VersionMismatch, 'true');

  const office = (await savedEmails()).find((email) => email.meta.to.includes(DEV));
  assert.ok(office, 'dev office notification should be routed to EMAIL_DEV');
  assert.match(office.meta.subject, /\[TEST\]/);
  assert.match(office.meta.subject, /\[VERSION MISMATCH\]/);
  assert.match(office.meta.subject, /Test Parent/);
});

test('retention cleanup deletes only rows older than the cutoff', async () => {
  const { deleteAuditEntriesBefore } = await import('../../src/auditTable.js');
  const table = tableClient();
  await table.createEntity({ partitionKey: '2020-01-01', rowKey: 'old', BlobName: '' });
  await table.createEntity({ partitionKey: '2999-01-01', rowKey: 'new', BlobName: '' });

  const deleted = await deleteAuditEntriesBefore('2026-01-01');
  assert.equal(deleted, 1);
  const remaining = (await auditRows()).map((row) => row.rowKey);
  assert.deepEqual(remaining, ['new']);
});
