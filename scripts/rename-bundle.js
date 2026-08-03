import { rename, rm } from 'node:fs/promises';

await rm('embed/pledge-form.html', { force: true });
await rename('embed/index.html', 'embed/pledge-form.html');
