import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // main.js reads this compile-time global during render.
  define: { __FORM_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: 'jsdom',
    include: ['tests/frontend/**/*.test.js'],
    setupFiles: ['tests/frontend/setup.js'],
    // Booting the full form under jsdom is comparatively slow.
    testTimeout: 30000,
  },
});
