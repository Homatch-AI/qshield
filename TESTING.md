# QShield Testing Guide

## Overview

QShield uses a multi-layer test architecture:

| Layer | Tool | Location | Purpose |
|-------|------|----------|---------|
| Unit | Vitest | `packages/qshield-core/__tests__/` | Core logic: scoring, crypto, evidence, policy |
| Integration | Vitest | `packages/qshield-core/__tests__/integration/` | Module interaction: pipelines, round-trips |
| E2E | Playwright | `packages/qshield-desktop/e2e/` | Full app: navigation, UI, IPC |
| Security | Playwright | `packages/qshield-desktop/e2e/security.spec.ts` | Automated security verification |

## Running Tests

### Unit Tests (qshield-core)

```bash
# Run all unit tests
pnpm -F @qshield/core test

# Run with watch mode
pnpm -F @qshield/core test:watch

# Run with coverage report
pnpm -F @qshield/core test -- --coverage

# Run a specific test file
pnpm -F @qshield/core test -- __tests__/crypto.test.ts

# Run tests matching a pattern
pnpm -F @qshield/core test -- -t "AES-256-GCM"
```

### Integration Tests

Integration tests live alongside unit tests and run with the same command:

```bash
pnpm -F @qshield/core test
```

They are located in `packages/qshield-core/__tests__/integration/` and test cross-module interactions:

- **trust-pipeline.test.ts** — Signals through trust scorer, evidence creation, chain verification
- **crypto-storage.test.ts** — Encrypt, store, retrieve, decrypt round-trip
- **policy-evaluation.test.ts** — Signal to policy evaluation to alert generation

### E2E Tests (Playwright)

```bash
# Build first (E2E tests require a production build)
pnpm build

# Install Playwright browsers (first time only)
npx playwright install --with-deps

# Run all E2E tests
pnpm -F @qshield/desktop test:e2e

# Run a specific E2E spec
npx playwright test packages/qshield-desktop/e2e/dashboard.spec.ts

# Run with headed browser (visible)
npx playwright test --headed

# Run with debug mode
npx playwright test --debug
```

### Security Tests

Security tests verify Electron hardening and source code safety:

```bash
# Build first
pnpm build

# Run security tests
npx playwright test packages/qshield-desktop/e2e/security.spec.ts
```

What the security tests verify:
- `nodeIntegration: false` on all windows
- `contextIsolation: true` on all windows
- `sandbox: true` on all windows
- `webSecurity` is not disabled
- CSP headers are set
- No `eval()` in source files
- No `require('electron').remote` in renderer
- No `require('child_process')` in renderer

## Test Structure

### Unit Tests

```
packages/qshield-core/__tests__/
  trust-scorer.test.ts    # Trust score computation, levels, weights
  crypto.test.ts          # AES-GCM, HMAC, PBKDF2, tamper detection
  evidence.test.ts        # Evidence chain creation, verification
  policy-rules.test.ts    # Policy evaluation, conditions, auto-freeze
  integration/
    trust-pipeline.test.ts
    crypto-storage.test.ts
    policy-evaluation.test.ts
```

### E2E Tests

```
packages/qshield-desktop/e2e/
  navigation.spec.ts      # Route transitions, sidebar
  dashboard.spec.ts       # Dashboard components
  vault.spec.ts           # Evidence vault search, table, detail
  certificates.spec.ts    # Certificate list, generate, export
  alerts.spec.ts          # Alert panel, dismiss, tabs
  settings.spec.ts        # Settings sections, toggles
  shield.spec.ts          # Shield overlay, IPC, security
  security.spec.ts        # Automated security verification
  fixtures/
    index.ts              # Mock data for tests
```

## Writing New Tests

### Conventions

- **File naming**: `<module>.test.ts` for unit tests, `<feature>.spec.ts` for E2E
- **Test structure**: Use `describe` blocks to group related tests
- **Helper functions**: Create `make*` factory functions for test data
- **Assertions**: Test both success and failure paths
- **Isolation**: Each test should be independent

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../src/module';

describe('myFunction', () => {
  it('returns expected result for valid input', () => {
    expect(myFunction('input')).toBe('expected');
  });

  it('handles edge case', () => {
    expect(myFunction('')).toBe('default');
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';

let electronApp, page;

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

test.describe('Feature', () => {
  test('renders correctly', async () => {
    await expect(page.locator('[data-testid="my-component"]')).toBeVisible();
  });
});
```

## CI/CD Pipeline

### CI (`ci.yml`) — Every push and PR to main

1. **Lint** — ESLint across all packages (ubuntu + macOS matrix)
2. **Type Check** — `tsc` on core package
3. **Test Core** — Vitest with coverage (ubuntu + macOS matrix)
4. **Test Desktop** — Desktop unit tests
5. **Build** — Full production build (ubuntu + macOS matrix)
6. **Security Scan** — Automated security test suite

### E2E (`e2e.yml`) — Push to main only

1. Full production build
2. Install Playwright browsers
3. Run complete E2E test suite
4. Upload test results and screenshots on failure

### Release (`release-macos.yml`, `release-windows.yml`) — Tag pushes

Build, package, and publish platform-specific installers.

## Coverage

Coverage thresholds are configured in `packages/qshield-core/vitest.config.ts`:

- Lines: 80%
- Branches: 80%
- Functions: 80%
- Statements: 80%

View coverage reports after running with `--coverage`:

```bash
pnpm -F @qshield/core test -- --coverage
open packages/qshield-core/coverage/index.html
```
