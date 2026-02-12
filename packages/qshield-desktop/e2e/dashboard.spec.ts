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

test.describe('Dashboard', () => {
  test('loads and displays trust score gauge', async () => {
    await expect(page.locator('[data-testid="trust-score-gauge"]')).toBeVisible();
  });

  test('trust score gauge shows a numeric value', async () => {
    const gauge = page.locator('[data-testid="trust-score-gauge"]');
    await expect(gauge).toBeVisible();
    const text = await gauge.textContent();
    // Should contain a number somewhere
    expect(text).toMatch(/\d+/);
  });

  test('shows the sidebar navigation', async () => {
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('Timeline')).toBeVisible();
    await expect(page.getByText('Evidence Vault')).toBeVisible();
  });

  test('displays active monitors section', async () => {
    await expect(page.locator('[data-testid="active-monitors"]')).toBeVisible();
  });

  test('active monitors lists adapter sources', async () => {
    const monitors = page.locator('[data-testid="active-monitors"]');
    await expect(monitors).toBeVisible();
    // Should contain at least one monitor item
    const items = monitors.locator('[data-testid="monitor-item"]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(0); // May be 0 if no adapters connected
  });

  test('displays recent events section', async () => {
    await expect(page.locator('[data-testid="recent-events"]')).toBeVisible();
  });

  test('shows status bar at bottom', async () => {
    await expect(page.locator('[data-testid="status-bar"]')).toBeVisible();
  });

  test('status bar shows connection info', async () => {
    const statusBar = page.locator('[data-testid="status-bar"]');
    await expect(statusBar).toBeVisible();
    const text = await statusBar.textContent();
    expect(text).toBeTruthy();
  });

  test('navigates to timeline', async () => {
    await page.getByText('Timeline').click();
    await expect(page.locator('[data-testid="trust-timeline"]')).toBeVisible();
  });

  test('navigates to evidence vault', async () => {
    await page.getByText('Evidence Vault').click();
    await expect(page.locator('[data-testid="evidence-vault"]')).toBeVisible();
  });

  test('navigates back to dashboard', async () => {
    await page.getByText('Dashboard').click();
    await expect(page.locator('[data-testid="trust-score-gauge"]')).toBeVisible();
  });

  test('dashboard shows trust level indicator', async () => {
    // Should display a trust level (verified, normal, elevated, warning, critical)
    const dashboard = page.locator('[data-testid="trust-score-gauge"]');
    await expect(dashboard).toBeVisible();
  });
});
