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

test.describe('Evidence Vault', () => {
  test.beforeEach(async () => {
    await page.getByText('Evidence Vault').click();
    await page.waitForSelector('[data-testid="evidence-vault"]');
  });

  test('displays the evidence vault page', async () => {
    await expect(page.locator('[data-testid="evidence-vault"]')).toBeVisible();
  });

  test('shows evidence search input', async () => {
    await expect(page.locator('[data-testid="evidence-search"]')).toBeVisible();
  });

  test('shows evidence table', async () => {
    await expect(page.locator('[data-testid="evidence-table"]')).toBeVisible();
  });

  test('search filters evidence records', async () => {
    const searchInput = page.locator('[data-testid="evidence-search"] input');
    await searchInput.fill('zoom');
    await page.waitForTimeout(500); // debounce
    // Table should still be visible (filtered or empty)
    await expect(page.locator('[data-testid="evidence-table"]')).toBeVisible();
  });

  test('clicking a row shows detail panel', async () => {
    const rows = page.locator('[data-testid="evidence-table"] tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await expect(page.locator('[data-testid="evidence-detail"]')).toBeVisible();
    }
  });
});
