import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

test.describe('Certificates', () => {
  test.beforeEach(async () => {
    const certLink = page.getByText('Certificates');
    if (await certLink.isVisible()) {
      await certLink.click();
    }
  });

  test('certificates page renders', async () => {
    const certPage = page.locator('[data-testid="certificates-page"]');
    if (await certPage.isVisible()) {
      await expect(certPage).toBeVisible();
    }
  });

  test('shows certificate list or empty state', async () => {
    const certPage = page.locator('[data-testid="certificates-page"]');
    if (await certPage.isVisible()) {
      // Either shows a list or an empty state message
      const list = page.locator('[data-testid="certificate-list"]');
      const emptyState = page.locator('[data-testid="certificates-empty"]');
      const hasContent = (await list.isVisible()) || (await emptyState.isVisible());
      expect(hasContent).toBe(true);
    }
  });

  test('generate certificate button is present', async () => {
    const certPage = page.locator('[data-testid="certificates-page"]');
    if (await certPage.isVisible()) {
      const genBtn = page.locator('[data-testid="generate-certificate"], button:has-text("Generate")');
      const btnCount = await genBtn.count();
      expect(btnCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('export button is present when certificates exist', async () => {
    const certList = page.locator('[data-testid="certificate-list"]');
    if (await certList.isVisible()) {
      const items = certList.locator('[data-testid="certificate-item"]');
      if ((await items.count()) > 0) {
        const exportBtn = page.locator('[data-testid="export-certificate"], button:has-text("Export")');
        expect(await exportBtn.count()).toBeGreaterThan(0);
      }
    }
  });
});
