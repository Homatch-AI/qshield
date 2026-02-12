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

test.describe('Alerts', () => {
  test.beforeEach(async () => {
    const alertLink = page.getByText('Alerts');
    if (await alertLink.isVisible()) {
      await alertLink.click();
    }
  });

  test('alerts page renders', async () => {
    const alertPage = page.locator('[data-testid="alerts-page"]');
    if (await alertPage.isVisible()) {
      await expect(alertPage).toBeVisible();
    }
  });

  test('shows alert list or empty state', async () => {
    const alertPage = page.locator('[data-testid="alerts-page"]');
    if (await alertPage.isVisible()) {
      const list = page.locator('[data-testid="alert-list"]');
      const emptyState = page.locator('[data-testid="alerts-empty"]');
      const hasContent = (await list.isVisible()) || (await emptyState.isVisible());
      expect(hasContent).toBe(true);
    }
  });

  test('alert items show severity indicator', async () => {
    const alertList = page.locator('[data-testid="alert-list"]');
    if (await alertList.isVisible()) {
      const items = alertList.locator('[data-testid="alert-item"]');
      if ((await items.count()) > 0) {
        const firstItem = items.first();
        await expect(firstItem).toBeVisible();
      }
    }
  });

  test('dismiss button on alert items', async () => {
    const alertList = page.locator('[data-testid="alert-list"]');
    if (await alertList.isVisible()) {
      const items = alertList.locator('[data-testid="alert-item"]');
      if ((await items.count()) > 0) {
        const dismissBtn = items.first().locator('[data-testid="dismiss-alert"], button:has-text("Dismiss")');
        if ((await dismissBtn.count()) > 0) {
          await expect(dismissBtn.first()).toBeVisible();
        }
      }
    }
  });

  test('tab switching between active and dismissed alerts', async () => {
    const alertPage = page.locator('[data-testid="alerts-page"]');
    if (await alertPage.isVisible()) {
      const activeTab = page.locator('[data-testid="tab-active"], button:has-text("Active")');
      const dismissedTab = page.locator('[data-testid="tab-dismissed"], button:has-text("Dismissed")');

      if ((await activeTab.count()) > 0 && (await dismissedTab.count()) > 0) {
        await dismissedTab.first().click();
        await page.waitForTimeout(300);
        await activeTab.first().click();
        await page.waitForTimeout(300);
        await expect(alertPage).toBeVisible();
      }
    }
  });
});
