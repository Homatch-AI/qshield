import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        'content/gmail': resolve(__dirname, 'src/content/gmail.ts'),
        'content/outlook': resolve(__dirname, 'src/content/outlook.ts'),
        'popup/popup': resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'popup/[name].[ext]',
        format: 'es',
      },
    },
  },
  plugins: [
    {
      name: 'copy-popup-assets',
      closeBundle() {
        // Copy manifest.json to dist, stripping "dist/" prefix from paths
        const manifest = readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8');
        writeFileSync(
          resolve(__dirname, 'dist/manifest.json'),
          manifest.replaceAll('dist/', ''),
        );
        // Copy icons to dist
        mkdirSync(resolve(__dirname, 'dist/icons'), { recursive: true });
        for (const size of ['16', '48', '128']) {
          copyFileSync(
            resolve(__dirname, `icons/icon-${size}.png`),
            resolve(__dirname, `dist/icons/icon-${size}.png`),
          );
        }
        // Copy popup HTML and CSS to dist (not processed by Vite)
        mkdirSync(resolve(__dirname, 'dist/popup'), { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/popup/popup.html'),
          resolve(__dirname, 'dist/popup/popup.html'),
        );
        copyFileSync(
          resolve(__dirname, 'src/popup/popup.css'),
          resolve(__dirname, 'dist/popup/popup.css'),
        );
      },
    },
  ],
});
