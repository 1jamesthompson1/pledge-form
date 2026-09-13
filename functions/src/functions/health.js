import { app } from '@azure/functions';
import { formVersion, formCommit } from '../formVersion.js';
import { pledgeRules } from '../pledgeConfig.js';

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ({
    status: 200,
    jsonBody: {
      status: 'ok',
      formVersion,
      formCommit,
      formYear: pledgeRules.year,
      emailEnabled: process.env.EMAIL_ENABLED === 'true',
    },
  }),
});
