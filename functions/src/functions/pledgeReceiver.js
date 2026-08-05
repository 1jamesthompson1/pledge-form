import { app } from '@azure/functions';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sendPledgeNotification } from '../graphEmail.js';
import { appendPledgeToExcel } from '../graphExcel.js';
import { buildPledgePdf } from '../pledgePdf.js';

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

    let payload;
    try {
      payload = await request.json();
    } catch {
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

    if (isLikelySpam(pledge)) {
      context.warn('Likely spam submission suppressed', {
        timeOnPageMs: pledge.timeOnPageMs,
        honeypotFilled: Boolean(pledge.website),
      });
      return { status: 200, jsonBody: { message: 'Pledge received' } };
    }

    const errors = validate(form);
    if (errors.length > 0) {
      context.warn(`Validation failed: ${errors.join(', ')}`);
      return { status: 400, jsonBody: { error: 'Validation failed', details: errors } };
    }

    context.log('Processing pledge', {
      parentName: pledge.parentName,
      email: pledge.email,
      receivedAt: pledge.receivedAt,
    });

    // Local demo: save the formatted pledge PDF to disk so it can be inspected
    // without email/Excel/Graph setup. Set PDF_SAVE_DIR (e.g. "out") locally;
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
    // - write to a SharePoint list or Excel file
    // - call a Power Automate flow

    if (process.env.EMAIL_ENABLED === 'true') {
      try {
        const pdfBuffer = await buildPledgePdf(pledge);
        await sendPledgeNotification(pledge, pdfBuffer);
        context.log('Notification email sent with PDF attached');
      } catch (error) {
        context.error('Failed to send notification email', error);
        return { status: 502, jsonBody: { error: 'Failed to send notification email' } };
      }
    }

    if (process.env.EXCEL_ENABLED === 'true') {
      try {
        await appendPledgeToExcel(pledge);
        context.log('Pledge appended to Excel workbook');
      } catch (error) {
        context.error('Failed to append pledge to Excel workbook', error);
        return { status: 502, jsonBody: { error: 'Failed to append pledge to Excel workbook' } };
      }
    }

    context.log('Pledge processed successfully');
    return { status: 200, jsonBody: { message: 'Pledge received' } };
  },
});
