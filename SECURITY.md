# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | Active support     |
| 1.0.x   | Security fixes only |
| < 1.0   | Not supported      |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@qshield.app** with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Any suggested fixes (optional)

### What to Expect

- **Acknowledgment** within 48 hours
- **Initial assessment** within 5 business days
- **Fix timeline** communicated within 10 business days
- **Credit** in the security advisory (unless you prefer anonymity)

### Scope

The following are in scope:
- QShield Desktop application (Electron main process, renderer, preload)
- QShield Core library (crypto, evidence chains, trust scoring)
- QShield Gateway API (authentication, evidence verification, WebSocket)
- Build and release pipeline security

The following are out of scope:
- Social engineering attacks
- Denial of service attacks
- Issues in third-party dependencies (report these upstream, but let us know)

## Security Architecture

QShield is built with defense-in-depth:

- **Encryption**: AES-256-GCM for data at rest, TLS 1.3 for data in transit
- **Key Management**: PBKDF2 (100K iterations, SHA-512) key derivation, OS keychain storage via Electron safeStorage
- **Evidence Integrity**: HMAC-SHA256 hash chains with constant-time comparison
- **Electron Security**: nodeIntegration disabled, contextIsolation enabled, sandbox enabled, CSP enforced
- **Authentication**: JWT (15-min access, 7-day refresh) + API key (SHA-256 hashed storage)
- **Rate Limiting**: Per-endpoint rate limits on all API routes

## Patent Notice

QShield's trust verification and evidence chain methodology is protected by US Patent 12,452,047 B1.
