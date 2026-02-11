# QShield Desktop — Deployment Guide

## Prerequisites

- Node.js 20 LTS
- pnpm 9+
- macOS 13+ (for macOS builds)
- Windows 10+ (for Windows builds)

## Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd qshield

# Install dependencies
pnpm install

# Build core package
pnpm -F @qshield/core build

# Start development server
pnpm dev
```

The Electron app will launch with Vite HMR for the renderer process.

## Building

### Build All Packages

```bash
pnpm build
```

### Build Individual Packages

```bash
pnpm -F @qshield/core build      # Core trust engine
pnpm -F @qshield/desktop build   # Desktop app
```

## Testing

```bash
pnpm test          # Unit tests (Vitest)
pnpm test:e2e      # E2E tests (Playwright + Electron)
pnpm lint          # ESLint + Prettier check
```

## Packaging

### macOS

```bash
pnpm -F @qshield/desktop package:mac
```

Produces a `.dmg` file in `packages/qshield-desktop/dist/`.

Requirements for production builds:
- Apple Developer certificate (for code signing)
- Apple ID + app-specific password (for notarization)
- Team ID

Set environment variables:
- `CSC_LINK` — Base64-encoded .p12 certificate
- `CSC_KEY_PASSWORD` — Certificate password
- `APPLE_ID` — Apple Developer account email
- `APPLE_APP_SPECIFIC_PASSWORD` — App-specific password
- `APPLE_TEAM_ID` — Developer team ID

### Windows

```bash
pnpm -F @qshield/desktop package:win
```

Produces an `.exe` installer in `packages/qshield-desktop/dist/`.

## CI/CD

GitHub Actions workflows are configured for:

### CI (`ci.yml`)
- Triggered on push to `main` and pull requests
- Jobs: lint, test core, build, E2E tests
- Runs on Ubuntu latest

### Release macOS (`release-macos.yml`)
- Triggered on version tags (`v*`)
- Builds and packages macOS DMG
- Creates draft GitHub release
- Requires repository secrets for code signing

### Release Windows (`release-windows.yml`)
- Triggered on version tags (`v*`)
- Builds and packages Windows installer
- Creates draft GitHub release

## Creating a Release

```bash
# Update version in package.json files
# Commit changes

# Tag the release
git tag v1.1.0
git push origin v1.1.0
```

The CI will automatically build and create a draft release on GitHub.

## Configuration

The application stores configuration in the OS-specific app data directory:
- macOS: `~/Library/Application Support/QShield Desktop/`
- Windows: `%APPDATA%/QShield Desktop/`

Configuration file: `qshield-config.json` (managed by electron-store)

### Default Configuration

```json
{
  "gateway": {
    "url": "http://localhost:8000",
    "timeout": 10000,
    "retryAttempts": 3,
    "retryDelay": 1000
  },
  "shield": {
    "enabled": true,
    "position": { "x": 20, "y": 20 }
  },
  "notifications": {
    "enabled": true,
    "minSeverity": "medium"
  },
  "storage": {
    "maxSizeMb": 500,
    "pruneOlderThanDays": 90
  }
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `QSHIELD_GATEWAY_URL` | Override gateway URL | No |
| `CSC_LINK` | macOS certificate (base64) | For signing |
| `CSC_KEY_PASSWORD` | Certificate password | For signing |
| `APPLE_ID` | Apple Developer email | For notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password | For notarization |
| `APPLE_TEAM_ID` | Developer Team ID | For notarization |
| `GH_TOKEN` | GitHub token for publishing | For releases |
