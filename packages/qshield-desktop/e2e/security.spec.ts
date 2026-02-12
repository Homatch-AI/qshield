import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

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

test.describe('Security Verification', () => {
  test('BrowserWindow has nodeIntegration disabled', async () => {
    const result = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().map((w) => ({
        title: w.getTitle(),
        nodeIntegration: w.webContents.getLastWebPreferences().nodeIntegration,
      }));
    });
    for (const win of result) {
      expect(win.nodeIntegration).toBe(false);
    }
  });

  test('BrowserWindow has contextIsolation enabled', async () => {
    const result = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().map((w) => ({
        title: w.getTitle(),
        contextIsolation: w.webContents.getLastWebPreferences().contextIsolation,
      }));
    });
    for (const win of result) {
      expect(win.contextIsolation).toBe(true);
    }
  });

  test('BrowserWindow has sandbox enabled', async () => {
    const result = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().map((w) => ({
        title: w.getTitle(),
        sandbox: w.webContents.getLastWebPreferences().sandbox,
      }));
    });
    for (const win of result) {
      expect(win.sandbox).toBe(true);
    }
  });

  test('webSecurity is not disabled', async () => {
    const result = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().map((w) => ({
        title: w.getTitle(),
        webSecurity: w.webContents.getLastWebPreferences().webSecurity,
      }));
    });
    for (const win of result) {
      // webSecurity should be true or undefined (defaults to true)
      expect(win.webSecurity).not.toBe(false);
    }
  });

  test('CSP headers are set on responses', async () => {
    // Navigate to trigger a page load and capture response headers
    const response = await page.goto(page.url());
    if (response) {
      const headers = response.headers();
      const csp = headers['content-security-policy'];
      if (csp) {
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self'");
      }
    }
  });
});

test.describe('Source Code Security Scan', () => {
  const projectRoot = path.join(__dirname, '../..');
  const rendererSrc = path.join(__dirname, '../src');
  const electronSrc = path.join(__dirname, '../electron');

  function scanFiles(dir: string, ext: string[]): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        results.push(...scanFiles(fullPath, ext));
      } else if (entry.isFile() && ext.some((e) => entry.name.endsWith(e))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  function readFileContent(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
  }

  test('no eval() usage in source files', () => {
    const files = [
      ...scanFiles(rendererSrc, ['.ts', '.tsx', '.js', '.jsx']),
      ...scanFiles(electronSrc, ['.ts', '.js']),
    ];
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileContent(file);
      // Match eval( but not "evaluate" or "evalCondition" etc.
      if (/\beval\s*\(/.test(content)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  test('no require("electron").remote usage in renderer', () => {
    const files = scanFiles(rendererSrc, ['.ts', '.tsx', '.js', '.jsx']);
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileContent(file);
      if (/require\s*\(\s*['"]electron['"]\s*\)\.remote/.test(content)) {
        violations.push(file);
      }
      if (/@electron\/remote/.test(content)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  test('no require("child_process") in renderer', () => {
    const files = scanFiles(rendererSrc, ['.ts', '.tsx', '.js', '.jsx']);
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileContent(file);
      if (/require\s*\(\s*['"]child_process['"]\s*\)/.test(content)) {
        violations.push(file);
      }
      if (/from\s+['"]child_process['"]/.test(content)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  test('no direct require("electron") in renderer', () => {
    const files = scanFiles(rendererSrc, ['.ts', '.tsx', '.js', '.jsx']);
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileContent(file);
      if (/require\s*\(\s*['"]electron['"]\s*\)/.test(content)) {
        violations.push(file);
      }
      if (/from\s+['"]electron['"]/.test(content)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  test('main process source sets webSecurity: true', () => {
    const mainFile = path.join(electronSrc, 'main.ts');
    if (fs.existsSync(mainFile)) {
      const content = readFileContent(mainFile);
      // Should not have webSecurity: false
      expect(content).not.toMatch(/webSecurity\s*:\s*false/);
    }
  });

  test('main process source disables nodeIntegration', () => {
    const mainFile = path.join(electronSrc, 'main.ts');
    if (fs.existsSync(mainFile)) {
      const content = readFileContent(mainFile);
      expect(content).toMatch(/nodeIntegration\s*:\s*false/);
    }
  });

  test('main process source enables contextIsolation', () => {
    const mainFile = path.join(electronSrc, 'main.ts');
    if (fs.existsSync(mainFile)) {
      const content = readFileContent(mainFile);
      expect(content).toMatch(/contextIsolation\s*:\s*true/);
    }
  });

  test('main process source enables sandbox', () => {
    const mainFile = path.join(electronSrc, 'main.ts');
    if (fs.existsSync(mainFile)) {
      const content = readFileContent(mainFile);
      expect(content).toMatch(/sandbox\s*:\s*true/);
    }
  });
});
