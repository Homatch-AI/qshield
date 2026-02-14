import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync } from 'node:fs';

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
