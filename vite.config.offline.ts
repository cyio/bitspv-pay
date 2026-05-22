import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createHtmlPlugin } from 'vite-plugin-html';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      createHtmlPlugin({
        pages: [
          {
            entry: 'src/main.jsx',
            filename: 'index.html',
            template: 'index.offline.html',
          },
        ],
        minify: true,
      }),
      viteSingleFile(),
    ],
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      'import.meta.env.VITE_OFFLINE_BUILD': '"true"',
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    },
    build: {
      target: 'ES2022',
      outDir: 'dist-offline',
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: path.resolve(__dirname, 'index.offline.html'),
      },
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
