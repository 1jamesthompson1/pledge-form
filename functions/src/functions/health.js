import { readFileSync } from 'node:fs';
import { app } from '@azure/functions';
import { formVersion, formCommit } from '../formVersion.js';
import { pledgeRules } from '../pledgeConfig.js';

const FORM_HTML = new URL('../pledgeForm.html', import.meta.url);

// The version baked into the bundle that is actually rendered into PDFs. It is
// read from the shipped bundle (not package.json) so the health endpoint can
// prove the form we report and the form we render are the same file.
function renderedFormVersion() {
  try {
    const match = readFileSync(FORM_HTML, 'utf8').match(/<meta name="form-version" content="([^"]+)"\s*\/?>/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ({
    status: 200,
    jsonBody: {
      status: 'ok',
      formVersion,
      renderedFormVersion: renderedFormVersion(),
      formCommit,
      formYear: pledgeRules.year,
      emailEnabled: process.env.EMAIL_ENABLED === 'true',
    },
  }),
});
