import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Vite plugin that converts the preload ESM output to CJS and renames to .cjs.
 * Needed because vite-plugin-electron always outputs ESM when package.json
 * has "type": "module", but Electron loads preload scripts via require().
 */
function preloadToCjs(): Plugin {
  return {
    name: 'preload-to-cjs',
    closeBundle() {
      const preloadPath = path.resolve(__dirname, 'dist/electron/preload.js');
      const cjsPath = path.resolve(__dirname, 'dist/electron/preload.cjs');
      if (!fs.existsSync(preloadPath)) return;

      let code = fs.readFileSync(preloadPath, 'utf-8');
      // Convert ESM imports to CJS requires for electron
      code = code.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']electron["'];?/g,
        'const {$1} = require("electron");',
      );
      // Remove any export statements (preload doesn't export)
      code = code.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
      fs.writeFileSync(cjsPath, code, 'utf-8');
      fs.unlinkSync(preloadPath);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist/electron',
            rollupOptions: {
              external: ['electron', 'better-sqlite3', 'electron-store', 'electron-log', 'zod', 'googleapis', 'google-auth-library', 'chokidar'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist/electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
          plugins: [preloadToCjs()],
        },
      },
      {
        entry: 'electron/services/exec-daemon.ts',
        vite: {
          build: {
            outDir: 'dist/electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    passWithNoTests: true,
  },
});
