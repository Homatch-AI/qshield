# Changelog

All notable changes to QShield are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-24

### Added
- **AI Governance Layer**: Real-time AI agent monitoring with session lifecycle management
  - Agent detection for Claude Code, GitHub Copilot, Cursor, Windsurf
  - Execution mode tracking (HUMAN_DIRECT, AI_ASSISTED, AI_AUTONOMOUS)
  - Risk velocity state machine (VALID -> DEGRADED -> INVALID -> FROZEN)
  - Envelope hash chains for AI action audit trails
  - Trust decay rates per execution mode
- **AI-Protected Zones**: User-defined files/directories forbidden from AI access
  - Three protection levels: Warn, Block, Freeze
  - Auto-freeze on zone violation
  - File picker integration for zone selection
- **High-Trust Asset Monitoring**: Critical file tracking with chokidar watchers
  - File forensics (lsof-based access detection)
  - System process filtering
  - Access cooldown (30s deduplication)
- **Licensing System**: Offline HMAC-based license validation
  - Four tiers: Free, Pro, Business, Enterprise
  - Feature gates per tier
  - Trial period support
- **QShield Gateway**: Cloud API server for multi-device sync
  - REST API with JWT + API key authentication
  - WebSocket hub for real-time signal streaming
  - Server-side evidence chain verification
  - Public verification pages with viral CTA
  - Trust certificate issuance and verification
- **Comprehensive Test Suite**: 534 core tests, 52 gateway tests
  - Trust scorer, evidence chains, crypto, AI governance, assets, notifications
  - Gateway database, auth, and evidence verifier tests

### Changed
- Upgraded to Electron 33.4
- Trust scoring engine now supports 7 adapter types (added `ai`)
- Evidence store supports key rotation with re-encryption
- Policy enforcer handles AI zone violation rules

### Security
- OS keychain integration via Electron safeStorage for secret storage
- Rate limiting on all gateway API endpoints
- SQL injection prevention (parameterized queries)
- Constant-time comparison for all cryptographic operations

## [1.0.0] - 2026-02-14

### Added
- Initial release of QShield Desktop
- **Trust Score Engine**: Weighted scoring across 6 adapters with exponential decay
- **Evidence Vault**: HMAC-SHA256 hash-chain linked records with AES-256-GCM encryption
- **Adapters**: Zoom, Teams, Email (Gmail OAuth), File Watcher, API Listener, Crypto Wallet
- **Policy Engine**: Configurable rules with alert/escalate/freeze actions
- **Trust Certificates**: PDF export with evidence chain attestation
- **Email Signatures**: Trust-scored HTML signatures with verification links
- **Crypto Security**: Clipboard guard, address verification, scam database
- **Shield Overlay**: Floating trust indicator with breathing animation
- **Desktop Packaging**: macOS DMG (notarized), Windows NSIS installer
- **CI/CD**: GitHub Actions (lint, test, build, security scan, release)
- **E2E Tests**: Playwright test suite (8 spec files)
