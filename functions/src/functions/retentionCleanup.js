import { app } from '@azure/functions';
import { deleteAuditEntriesBefore } from '../auditTable.js';

const DEFAULT_RETENTION_DAYS = 730;
const configured = Number(process.env.RETENTION_DAYS);
const RETENTION_DAYS = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETENTION_DAYS;

app.timer('retentionCleanup', {
  schedule: '0 30 2 * * *',
  runOnStartup: false,
  handler: async (myTimer, context) => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const deleted = await deleteAuditEntriesBefore(cutoff);
      context.log(`Retention cleanup: deleted ${deleted} audit entries older than ${cutoff} (${RETENTION_DAYS}-day retention)`);
    } catch (error) {
      context.error('Retention cleanup failed', error);
    }
  },
});
