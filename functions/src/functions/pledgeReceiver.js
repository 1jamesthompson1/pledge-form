import { app } from '@azure/functions';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sendPledgeNotification } from '../graphEmail.js';
import { buildPledgePdf } from '../pledgeRender.js';
import { persistSubmission, newSubmissionId } from '../blobStore.js';
import { createAuditEntry, updateAuditEntry, partitionKeyFor } from '../auditTable.js';

const requiredFields = [
  'parentName',
  'email',
  'schoolChildCount',
  'kindergartenChildCount',
  'signature',
  'signatureDate',
];

const MIN_FILL_TIME_MS = 5000;

function isLikelySpam(pledge) {
  if (pledge.website && String(pledge.website).trim()) return true;
  const timeOnPageMs = Number(pledge.timeOnPageMs);
  return !Number.isFinite(timeOnPageMs) || timeOnPageMs < MIN_FILL_TIME_MS;
}

function validate(payload) {
  const errors = [];
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  const schoolCount = Number(payload.schoolChildCount) || 0;
  const kindergartenCount = Number(payload.kindergartenChildCount) || 0;
  if (schoolCount + kindergartenCount === 0) {
    errors.push('At least one child must be added');
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push('Invalid email address');
  }

  return errors;
}

app.http('pledgeReceiver', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'pledges',
  handler: async (request, context) => {
    context.log(`Pledge submission received from ${request.headers.get('origin') || 'unknown'}`);

    // Persist the raw submission to blob storage before any processing so no
    // submission is ever lost, even if validation or email fails.
    let rawBody;
    try {
      rawBody = await request.text();
    } catch {
      return { status: 400, jsonBody: { error: 'Could not read request body' } };
    }

    const submissionId = newSubmissionId();
    const partitionKey = partitionKeyFor();

    let blobName;
    try {
      blobName = await persistSubmission(rawBody, {
        ip: request.headers.get('x-forwarded-for') || undefined,
        origin: request.headers.get('origin') || undefined,
      }, submissionId);
      context.log(`Raw submission stored in blob: ${blobName}`);
    } catch (error) {
      context.error('Failed to persist raw submission to blob storage', error);
      return { status: 502, jsonBody: { error: 'Failed to persist submission' } };
    }

    try {
      await createAuditEntry({
        submissionId,
        blobName,
        partitionKey,
        parentName: '',
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      context.error('Failed to create audit table entry', error);
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      await updateAuditEntry({
        submissionId,
        partitionKey,
        fields: { Status: 'invalid-json', Errors: 'Invalid JSON payload' },
      }).catch((error) => context.error('Failed to update audit table entry', error));
      return { status: 400, jsonBody: { error: 'Invalid JSON payload' } };
    }

    const form = payload && typeof payload.form === 'object' && payload.form !== null ? payload.form : payload;

    const pledge = {
      ...form,
      receivedAt: new Date().toISOString(),
      submittedAt: payload.submittedAt || null,
      startDate: payload.startDate || '',
      timeOnPageMs: payload.timeOnPageMs ?? form.timeOnPageMs,
    };

    const auditFields = { ParentName: pledge.parentName || '', SubmittedAt: pledge.submittedAt || pledge.receivedAt };

    if (isLikelySpam(pledge)) {
      context.warn('Likely spam submission suppressed', {
        timeOnPageMs: pledge.timeOnPageMs,
        honeypotFilled: Boolean(pledge.website),
      });
      await updateAuditEntry({
        submissionId,
        partitionKey,
        fields: { ...auditFields, Status: 'spam-suppressed', Errors: 'Likely spam submission suppressed' },
      }).catch((error) => context.error('Failed to update audit table entry', error));
      return { status: 200, jsonBody: { message: 'Pledge received' } };
    }

    const errors = validate(form);
    if (errors.length > 0) {
      context.warn(`Validation failed: ${errors.join(', ')}`);
      await updateAuditEntry({
        submissionId,
        partitionKey,
        fields: { ...auditFields, Status: 'validation-failed', Errors: errors.join(', ') },
      }).catch((error) => context.error('Failed to update audit table entry', error));
      return { status: 400, jsonBody: { error: 'Validation failed', details: errors } };
    }

    context.log('Processing pledge', {
      parentName: pledge.parentName,
      email: pledge.email,
      receivedAt: pledge.receivedAt,
    });

    // Local demo: save the formatted pledge PDF to disk so it can be inspected
    // without email/Graph setup. Set PDF_SAVE_DIR (e.g. "out") locally;
    // leave unset in production.
    if (process.env.PDF_SAVE_DIR) {
      try {
        const pdfBuffer = await buildPledgePdf(pledge);
        const dir = process.env.PDF_SAVE_DIR;
        await mkdir(dir, { recursive: true });
        const filePath = path.join(dir, `pledge-${Date.now()}.pdf`);
        await writeFile(filePath, pdfBuffer);
        context.log(`Demo PDF saved to ${filePath}`);
      } catch (error) {
        context.error('Failed to save demo PDF', error);
      }
    }

    // TODO: add your downstream actions here, for example:
    // - write to a SharePoint list
    // - call a Power Automate flow

    const auditUpdate = (fields) =>
      updateAuditEntry({ submissionId, partitionKey, fields }).catch((error) =>
        context.error('Failed to update audit table entry', error),
      );

    if (process.env.EMAIL_ENABLED === 'true') {
      try {
        const pdfBuffer = await buildPledgePdf(pledge);
        await sendPledgeNotification(pledge, pdfBuffer);
        context.log('Notification email sent with PDF attached');
        await auditUpdate({ ...auditFields, EmailSent: 'true' });
      } catch (error) {
        context.error('Failed to send notification email', error);
        await auditUpdate({
          ...auditFields,
          Status: 'email-failed',
          EmailSent: 'false',
          EmailError: String(error?.message || error),
          Errors: String(error?.message || error),
        });
        return { status: 502, jsonBody: { error: 'Failed to send notification email' } };
      }
    }

    context.log('Pledge processed successfully');
    await auditUpdate({ ...auditFields, Status: 'processed' });
    return { status: 200, jsonBody: { message: 'Pledge received' } };
  },
});
