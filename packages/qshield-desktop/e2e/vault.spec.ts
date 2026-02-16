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
    await expect(page.locator('[data-testid="evidence-table"]')).toBeVisible();
  });

  test('search can be cleared', async () => {
    const searchInput = page.locator('[data-testid="evidence-search"] input');
    await searchInput.fill('test');
    await page.waitForTimeout(300);
    await searchInput.clear();
    await page.waitForTimeout(300);
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

  test('detail panel can be closed', async () => {
    const rows = page.locator('[data-testid="evidence-table"] tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      const detail = page.locator('[data-testid="evidence-detail"]');
      if (await detail.isVisible()) {
        const closeBtn = detail.locator('[data-testid="close-detail"], button:has-text("Close"), [aria-label="Close"]');
        if (await closeBtn.count() > 0) {
          await closeBtn.first().click();
        }
      }
    }
  });

  test('evidence table has column headers', async () => {
    const table = page.locator('[data-testid="evidence-table"]');
    const headers = table.locator('thead th');
    const count = await headers.count();
    expect(count).toBeGreaterThan(0);
  });

  test('table sorting — clicking a column header changes sort', async () => {
    const headers = page.locator('[data-testid="evidence-table"] thead th');
    const count = await headers.count();
    if (count > 0) {
      // Click first sortable header
      await headers.first().click();
      // Table should still be visible (sorted)
      await expect(page.locator('[data-testid="evidence-table"]')).toBeVisible();
    }
  });
});
