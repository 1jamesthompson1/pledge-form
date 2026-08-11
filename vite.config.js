import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { viteSingleFile } from 'vite-plugin-singlefile';

function devConfigPlugin(env) {
  const config = {};
  if (env.VITE_SUBMIT_URL) config.submitUrl = env.VITE_SUBMIT_URL;
  if (env.VITE_CONTACT_EMAIL) config.contactEmail = env.VITE_CONTACT_EMAIL;
  if (env.VITE_DEV === 'true') config.dev = true;
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
    plugins: [
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
