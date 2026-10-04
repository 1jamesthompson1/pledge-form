import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Stamp the build with the version it was built from. The backend reads this
// marker to report the version of the form it actually renders, so the reported
// version can never drift from the bundle in the PDF.
function formVersionMetaPlugin(version) {
  return {
    name: 'pledge-form-version-meta',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `    <meta name="form-version" content="${version}" />\n  </head>`,
      );
    },
  };
}

function devConfigPlugin(env) {
  const config = {};
  if (env.VITE_SUBMIT_URL) config.submitUrl = env.VITE_SUBMIT_URL;
  if (env.VITE_CONTACT_EMAIL) config.contactEmail = env.VITE_CONTACT_EMAIL;
  if (env.VITE_DEV === 'true') config.dev = true;
  if (env.VITE_DRAFT === 'true') config.draft = true;
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return {
    name: 'pledge-dev-config',
    apply: 'serve',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'text/javascript' },
          children: `window.PLEDGE_CONFIG = ${json};`,
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: { __FORM_VERSION__: JSON.stringify(pkg.version) },
    plugins: [
      formVersionMetaPlugin(pkg.version),
      ...(command === 'serve' ? [basicSsl(), devConfigPlugin(env)] : []),
      ...(command === 'build' ? [viteSingleFile()] : []),
    ],
    build: {
      outDir: 'dist',
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: { 'pledge-form': 'index.html' },
        output: { inlineDynamicImports: true },
      },
    },
  };
});
