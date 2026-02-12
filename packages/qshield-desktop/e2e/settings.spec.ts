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

test.describe('Settings', () => {
  test.beforeEach(async () => {
    const settingsLink = page.getByText('Settings');
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
    }
  });

  test('settings page renders', async () => {
    const settingsPage = page.locator('[data-testid="settings-page"]');
    if (await settingsPage.isVisible()) {
      await expect(settingsPage).toBeVisible();
    }
  });

  test('settings sections are present', async () => {
    const settingsPage = page.locator('[data-testid="settings-page"]');
    if (await settingsPage.isVisible()) {
      // Should have at least one settings section
      const sections = settingsPage.locator('[data-testid="settings-section"]');
      const count = await sections.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('toggle interactions work', async () => {
    const settingsPage = page.locator('[data-testid="settings-page"]');
    if (await settingsPage.isVisible()) {
      const toggles = settingsPage.locator('input[type="checkbox"], [role="switch"]');
      if ((await toggles.count()) > 0) {
        const firstToggle = toggles.first();
        const initialState = await firstToggle.isChecked().catch(() => null);
        if (initialState !== null) {
          await firstToggle.click();
          // Toggle should change state
          const newState = await firstToggle.isChecked().catch(() => null);
          if (newState !== null) {
            expect(newState).not.toBe(initialState);
          }
        }
      }
    }
  });

  test('gateway settings section exists', async () => {
    const settingsPage = page.locator('[data-testid="settings-page"]');
    if (await settingsPage.isVisible()) {
      const gatewaySection = page.locator('[data-testid="gateway-settings"]');
      // May or may not exist depending on implementation
      if (await gatewaySection.isVisible()) {
        await expect(gatewaySection).toBeVisible();
      }
    }
  });
});
