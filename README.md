<div align="center">

# 🛡️ QShield Desktop

**Enterprise Trust Monitoring Platform**

Real-time trust scoring, tamper-evident evidence chains, and AI governance for digital communications.

[![CI](https://github.com/Homatch-AI/qshield/actions/workflows/ci.yml/badge.svg)](https://github.com/Homatch-AI/qshield/actions/workflows/ci.yml)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-blue.svg)](LICENSE)
[![Patent](https://img.shields.io/badge/US%20Patent-12%2C452%2C047%20B1-green.svg)](https://patents.google.com/patent/US12452047B1)

[Download](https://qshield.app/download) · [Documentation](https://docs.qshield.app) · [Report Issue](https://github.com/Homatch-AI/qshield/issues)

</div>

---

## What is QShield?

QShield continuously monitors your digital workspace — emails, video calls, file access, API activity, and AI agent behavior — producing a real-time **trust score** backed by **cryptographic evidence chains**.

Every event is hashed into a tamper-evident chain (HMAC-SHA256), encrypted at rest (AES-256-GCM), and stored locally on your machine. You control what syncs to the cloud.

### Key Features

- **Trust Score Engine** — Weighted, decay-adjusted scoring across 7 signal adapters
- **Evidence Vault** — Hash-chain linked records with tamper detection and encrypted storage
- **AI Governance** — Monitor and constrain AI agents (Claude Code, Copilot, Cursor) with protected zones and auto-freeze
- **Verification Links** — Embed trust scores in email signatures; recipients verify with one click
- **Trust Certificates** — Exportable PDF certificates with evidence chain attestation
- **Crypto Security** — Clipboard guard, address verification, scam database matching
- **Policy Engine** — Configurable rules with alert, escalate, and freeze actions

### Patent

QShield is protected by **US Patent 12,452,047 B1** — "Quantum Secure Communication Protocol", covering the cryptographic trust verification and evidence chain methodology.

## Architecture

```
qshield/
├── packages/
│   ├── qshield-core/        # Trust scoring, crypto, evidence, policy (shared library)
│   ├── qshield-desktop/     # Electron app (macOS + Windows)
│   └── qshield-gateway/     # REST API + WebSocket server (Node.js/Fastify)
├── docs/                    # Architecture, deployment, schemas
└── .github/workflows/       # CI, release pipelines
```

## Quick Start

### Prerequisites
- Node.js >= 20
- pnpm >= 9

### Development
```bash
git clone https://github.com/Homatch-AI/qshield.git
cd qshield
pnpm install
pnpm build
pnpm dev
```

### Testing
```bash
# Core unit tests
pnpm -F @qshield/core test

# Desktop E2E tests
pnpm -F @qshield/desktop test:e2e

# Gateway integration tests
pnpm -F @qshield/gateway test

# All tests
pnpm test
```

### Packaging
```bash
# macOS DMG
pnpm -F @qshield/desktop package:mac

# Windows NSIS
pnpm -F @qshield/desktop package:win
```

## Security

QShield takes security seriously. See [SECURITY.md](SECURITY.md) for our vulnerability disclosure policy.

- All encryption uses Node.js native `crypto` module (no third-party crypto)
- Evidence chains use HMAC-SHA256 with constant-time comparison
- Desktop enforces `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
- Keys derived via PBKDF2 (100,000 iterations, SHA-512)
- Secrets stored in OS keychain via Electron `safeStorage`

## License

QShield is proprietary software by [Homatch AI, Inc.](https://qshield.app) Personal, non-commercial use is free. Commercial use requires a paid license — contact licensing@qshield.app.

Protected by US Patent 12,452,047 B1. See [LICENSE](LICENSE) for details.

## Links

- [Website](https://qshield.app)
- [Documentation](https://docs.qshield.app)
- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)
- [Changelog](CHANGELOG.md)
