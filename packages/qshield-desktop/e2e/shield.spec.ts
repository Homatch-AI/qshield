import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';

let electronApp: Awaited<ReturnType<typeof electron.launch>>;
let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../dist/electron/main.js')],
  });
  page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Shield Overlay', () => {
  test('main window has correct security settings', async () => {
    const webContents = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        nodeIntegration: win.webContents.getLastWebPreferences().nodeIntegration,
        contextIsolation: win.webContents.getLastWebPreferences().contextIsolation,
        sandbox: win.webContents.getLastWebPreferences().sandbox,
      };
    });

    expect(webContents.nodeIntegration).toBe(false);
    expect(webContents.contextIsolation).toBe(true);
    expect(webContents.sandbox).toBe(true);
  });

  test('app version is accessible via IPC', async () => {
    const version = await page.evaluate(() => {
      return (window as { qshield: { app: { version: () => Promise<string> } } }).qshield.app.version();
    });
    expect(version).toBeTruthy();
  });
});
