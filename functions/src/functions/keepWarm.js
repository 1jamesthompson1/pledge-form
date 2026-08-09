import { app } from '@azure/functions';
import { buildPledgePdf } from '../pledgeRender.js';

const warmUpPledge = {
  parentName: 'Warm-up',
  email: 'warmup@example.com',
  schoolChildCount: '0',
  kindergartenChildCount: '0',
  signature: 'Warm-up',
  signatureDate: new Date().toISOString().split('T')[0],
  submittedAt: new Date().toISOString(),
  timeOnPageMs: 60000,
};

app.timer('keepWarm', {
  schedule: '0 */5 * * * *',
  runOnStartup: false,
  handler: async (myTimer, context) => {
    try {
      const pdf = await buildPledgePdf(warmUpPledge);
      context.log(`Keep-warm tick ${new Date().toISOString()} — Chromium warmed (${pdf.length} bytes)`);
    } catch (error) {
      context.log(`Keep-warm tick ${new Date().toISOString()} — browser warm-up failed: ${String(error?.message || error)}`);
    }
  },
});
