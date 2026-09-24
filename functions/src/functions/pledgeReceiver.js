import { app } from '@azure/functions';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sendPledgeNotification, sendParentConfirmation } from '../graphEmail.js';
import { buildPledgePdf } from '../pledgeRender.js';
import { persistSubmission, newSubmissionId } from '../blobStore.js';
import { createAuditEntry, updateAuditEntry, partitionKeyFor } from '../auditTable.js';
import { pledgeRules } from '../pledgeConfig.js';
import { formVersion as backendFormVersion } from '../formVersion.js';

const requiredFields = [
  'parentName',
  'email',
  'schoolChildCount',
  'kindergartenChildCount',
  'signature',
  'signatureDate',
];

const MIN_FILL_TIME_MS = 5000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Nothing is suppressed: a filled honeypot or a short/missing fill time is only
// a hint. It is recorded on the audit row and flagged on the office email, but
// the submission is still processed and emailed like any other, because silently
// losing a real pledge costs far more than one extra email. Email failures
// surface as a 502 — they are never hidden behind a fake success.
function honeypotFilled(pledge) {
  return Boolean(pledge.website && String(pledge.website).trim());
}

function spamReasons(pledge) {
  const reasons = [];
  if (honeypotFilled(pledge)) reasons.push('honeypot field was filled');
  const timeOnPageMs = Number(pledge.timeOnPageMs);
  if (!Number.isFinite(timeOnPageMs)) reasons.push('no time-on-page recorded');
  else if (timeOnPageMs < MIN_FILL_TIME_MS) reasons.push(`completed in ${Math.round(timeOnPageMs)}ms (under ${MIN_FILL_TIME_MS}ms)`);
  return reasons;
}

function validate(payload) {
  const errors = [];
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  const maxChildren = pledgeRules.maxChildrenPerGroup;
  const parseCount = (value) => {
    if (value === undefined || value === null || value === '') return NaN;
    return Number(value);
  };
  const schoolCount = parseCount(payload.schoolChildCount);
  const kindergartenCount = parseCount(payload.kindergartenChildCount);

  const invalidCount = (value) => !Number.isInteger(value) || value < 0 || value > maxChildren;
  if (invalidCount(schoolCount)) {
    errors.push(`schoolChildCount must be a whole number between 0 and ${maxChildren}`);
  }
  if (invalidCount(kindergartenCount)) {
    errors.push(`kindergartenChildCount must be a whole number between 0 and ${maxChildren}`);
  }
  if (!invalidCount(schoolCount) && !invalidCount(kindergartenCount) && schoolCount + kindergartenCount === 0) {
    errors.push('At least one child (school or kindergarten) must be added');
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push('Invalid email address');
  }

  if (payload.otherParentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.otherParentEmail)) {
    errors.push('Invalid other parent / guardian email address');
  }

  return errors;
}

// Exported so tests can invoke the handler directly, without the Functions host.
export async function handlePledge(request, context, deps = {}) {
    // Injection point for tests; defaults to the real implementations.
    const notify = deps.sendPledgeNotification || sendPledgeNotification;
    const confirm = deps.sendParentConfirmation || sendParentConfirmation;
    const submissionId = newSubmissionId();
    const partitionKey = partitionKeyFor();

    try {
      context.log(`Pledge submission received from ${request.headers.get('origin') || 'unknown'}`);

      const contentLength = Number(request.headers.get('content-length') || 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        context.warn(`Rejected oversized submission (${contentLength} bytes)`);
        return { status: 413, jsonBody: { error: `Submission too large (limit ${MAX_BODY_BYTES} bytes)` } };
      }

      let rawBody;
      try {
        rawBody = await request.text();
      } catch {
        return { status: 400, jsonBody: { error: 'Could not read request body' } };
      }

      if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
        context.warn(`Rejected oversized submission (${Buffer.byteLength(rawBody, 'utf8')} bytes)`);
        return { status: 413, jsonBody: { error: `Submission too large (limit ${MAX_BODY_BYTES} bytes)` } };
      }

      // Persist the raw submission to blob storage before any processing so no
      // submission is ever lost, even if validation or email fails.
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
        formVersion: payload.formVersion || '',
        dev: payload.dev === true || payload.dev === 'true',
      };

      const reasons = spamReasons(pledge);
      const suspect = reasons.length > 0;
      const versionMismatch = Boolean(pledge.formVersion) && pledge.formVersion !== backendFormVersion;
      const auditFields = {
        ParentName: pledge.parentName || '',
        SubmittedAt: pledge.submittedAt || pledge.receivedAt,
        FormVersion: String(pledge.formVersion || ''),
        VersionMismatch: versionMismatch ? 'true' : 'false',
        Dev: pledge.dev ? 'true' : 'false',
        Suspect: suspect ? 'true' : 'false',
        SpamReason: reasons.join(', '),
      };

      if (versionMismatch) {
        context.warn(`Form version mismatch: submission is ${pledge.formVersion}, backend is ${backendFormVersion}`);
      }

      if (suspect) {
        context.warn(`Submission flagged as possible spam: ${reasons.join(', ')}`);
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

      context.log(`Processing pledge ${submissionId}`);

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

      let confirmationEmailSent = null;
      let confirmationWarning = '';

      if (process.env.EMAIL_ENABLED === 'true') {
        try {
          const pdfBuffer = await buildPledgePdf(pledge);
          await notify(pledge, pdfBuffer, {
            formVersion: pledge.formVersion,
            backendFormVersion,
            mismatch: versionMismatch,
            suspect,
            suspectReason: reasons.join(', '),
          });
          context.log('Office notification email sent with PDF attached');
          await auditUpdate({ ...auditFields, EmailSent: 'true' });
        } catch (error) {
          context.error('Failed to send office notification email', error);
          await auditUpdate({
            ...auditFields,
            Status: 'email-failed',
            EmailSent: 'false',
            EmailError: String(error?.message || error),
            Errors: String(error?.message || error),
          });
          return { status: 502, jsonBody: { error: 'Failed to send notification email' } };
        }

        // The parent confirmation is only sent after the office has been
        // notified, so parents are never told a pledge was received when the
        // school's copy failed. A confirmation failure never fails the request.
        // Test (?dev) confirmations are routed to EMAIL_DEV/EMAIL_ADMIN instead
        // of the sample parent address.
        try {
          await confirm(pledge);
          context.log('Parent confirmation email sent');
          confirmationEmailSent = true;
          await auditUpdate({ ...auditFields, EmailSent: 'true', ParentEmailSent: 'true' });
        } catch (error) {
          context.error('Failed to send parent confirmation email', error);
          confirmationEmailSent = false;
          confirmationWarning = `The school has received your pledge, but a confirmation email could not be sent to ${pledge.email}. Please check that your email address is correct, or contact the school office.`;
          await auditUpdate({
            ...auditFields,
            EmailSent: 'true',
            ParentEmailSent: 'false',
            ParentEmailError: String(error?.message || error),
          });
        }
      }

      context.log('Pledge processed successfully');
      await auditUpdate({ ...auditFields, Status: 'processed' });
      return {
        status: 200,
        jsonBody: {
          message: 'Pledge received',
          ...(confirmationEmailSent === null ? {} : { confirmationEmailSent }),
          ...(confirmationWarning ? { warning: confirmationWarning } : {}),
        },
      };
    } catch (error) {
      context.error(`Unhandled error processing submission ${submissionId}`, error);
      return { status: 500, jsonBody: { error: 'Unexpected server error', submissionId } };
    }
}

app.http('pledgeReceiver', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'pledges',
  handler: handlePledge,
});
