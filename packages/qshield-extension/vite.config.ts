import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/**
 * Content scripts must be IIFE (Chrome doesn't support ES modules in content
 * scripts). Background + popup can use ES modules.
 *
 * Build passes (orchestrated by the `build` script in package.json):
 *   1. `vite build`                          → background + popup (ES)
 *   2. `CONTENT_ENTRY=gmail vite build`      → content/gmail.js  (IIFE)
 *   3. `CONTENT_ENTRY=outlook vite build`    → content/outlook.js (IIFE)
 *
 * Each content script is built individually because IIFE format doesn't
 * support multiple entry points (Rollup treats that as code-splitting).
 */

const contentEntry = process.env.CONTENT_ENTRY; // 'gmail' | 'outlook' | undefined

const copyAssetsPlugin = {
  name: 'copy-popup-assets',
  closeBundle() {
    const manifest = readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8');
    writeFileSync(
      resolve(__dirname, 'dist/manifest.json'),
      manifest.replaceAll('dist/', ''),
    );
    mkdirSync(resolve(__dirname, 'dist/icons'), { recursive: true });
    for (const size of ['16', '48', '128']) {
      copyFileSync(
        resolve(__dirname, `icons/icon-${size}.png`),
        resolve(__dirname, `dist/icons/icon-${size}.png`),
      );
    }
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
};

export default defineConfig(
  contentEntry
    ? {
        // ── Content script build (IIFE, single entry, all deps inlined) ────
        build: {
          outDir: 'dist',
          emptyOutDir: false,
          target: 'esnext',
          minify: false,
          rollupOptions: {
            input: {
              [`content/${contentEntry}`]: resolve(
                __dirname,
                `src/content/${contentEntry}.ts`,
              ),
            },
            output: {
              entryFileNames: '[name].js',
              format: 'iife',
            },
          },
        },
      }
    : {
        // ── Main build: background + popup (ES modules) ────────────────────
        build: {
          outDir: 'dist',
          emptyOutDir: true,
          target: 'esnext',
          minify: false,
          rollupOptions: {
            input: {
              background: resolve(__dirname, 'src/background.ts'),
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
        plugins: [copyAssetsPlugin],
      },
);
