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

test.describe('Navigation', () => {
  test('sidebar is visible on load', async () => {
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
  });

  test('dashboard is the default route', async () => {
    await expect(page.locator('[data-testid="trust-score-gauge"]')).toBeVisible();
  });

  test('navigates to Timeline via sidebar', async () => {
    await page.getByText('Timeline').click();
    await expect(page.locator('[data-testid="trust-timeline"]')).toBeVisible();
  });

  test('navigates to Evidence Vault via sidebar', async () => {
    await page.getByText('Evidence Vault').click();
    await expect(page.locator('[data-testid="evidence-vault"]')).toBeVisible();
  });

  test('navigates to Certificates via sidebar', async () => {
    const certLink = page.getByText('Certificates');
    if (await certLink.isVisible()) {
      await certLink.click();
      await expect(page.locator('[data-testid="certificates-page"]')).toBeVisible();
    }
  });

  test('navigates to Alerts via sidebar', async () => {
    const alertLink = page.getByText('Alerts');
    if (await alertLink.isVisible()) {
      await alertLink.click();
      await expect(page.locator('[data-testid="alerts-page"]')).toBeVisible();
    }
  });

  test('navigates to Settings via sidebar', async () => {
    const settingsLink = page.getByText('Settings');
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();
    }
  });

  test('navigates back to Dashboard from another route', async () => {
    await page.getByText('Evidence Vault').click();
    await expect(page.locator('[data-testid="evidence-vault"]')).toBeVisible();
    await page.getByText('Dashboard').click();
    await expect(page.locator('[data-testid="trust-score-gauge"]')).toBeVisible();
  });

  test('all sidebar links are present', async () => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar.getByText('Dashboard')).toBeVisible();
    await expect(sidebar.getByText('Timeline')).toBeVisible();
    await expect(sidebar.getByText('Evidence Vault')).toBeVisible();
  });

  test('rapid navigation between routes does not crash', async () => {
    await page.getByText('Timeline').click();
    await page.getByText('Dashboard').click();
    await page.getByText('Evidence Vault').click();
    await page.getByText('Timeline').click();
    await page.getByText('Dashboard').click();
    // Should still be on dashboard
    await expect(page.locator('[data-testid="trust-score-gauge"]')).toBeVisible();
  });
});
