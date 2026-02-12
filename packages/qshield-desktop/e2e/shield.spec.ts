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

  test('qshield API is exposed on window', async () => {
    const hasApi = await page.evaluate(() => {
      return typeof (window as { qshield?: unknown }).qshield === 'object';
    });
    expect(hasApi).toBe(true);
  });

  test('trust API is accessible', async () => {
    const hasTrustApi = await page.evaluate(() => {
      const qshield = (window as { qshield: { trust: { getState: unknown } } }).qshield;
      return typeof qshield.trust?.getState === 'function';
    });
    expect(hasTrustApi).toBe(true);
  });

  test('evidence API is accessible', async () => {
    const hasEvidenceApi = await page.evaluate(() => {
      const qshield = (window as { qshield: { evidence: { list: unknown } } }).qshield;
      return typeof qshield.evidence?.list === 'function';
    });
    expect(hasEvidenceApi).toBe(true);
  });

  test('trust level indicator reflects trust state', async () => {
    const gauge = page.locator('[data-testid="trust-score-gauge"]');
    await expect(gauge).toBeVisible();
    // Gauge should have some visual content
    const box = await gauge.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});
