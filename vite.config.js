import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ command }) => ({
  plugins: [
    ...(command === 'serve' ? [basicSsl()] : []),
    ...(command === 'build' ? [viteSingleFile()] : []),
  ],
  build: {
    outDir: 'embed',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { 'pledge-form': 'index.html' },
      output: { inlineDynamicImports: true },
    },
  },
}));
