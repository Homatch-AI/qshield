# QShield Desktop — Architecture

## Overview

QShield Desktop is an enterprise trust monitoring platform built as an Electron application with a React frontend. It monitors communication channels (Zoom, Teams, email, file transfers, API interactions) for security anomalies and maintains cryptographic evidence records.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Renderer Process                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  React   │  │ Zustand  │  │  React Router    │  │
│  │Components│◄─┤  Stores  │◄─┤  (HashRouter)    │  │
│  └────┬─────┘  └────┬─────┘  └──────────────────┘  │
│       │              │                               │
│       └──────┬───────┘                               │
│              │ window.qshield (typed IPC)            │
│──────────────┼───────────────────────────────────────│
│              │ contextBridge                         │
│──────────────┼───────────────────────────────────────│
│              ▼                                       │
│         ┌─────────┐                                  │
│         │ Preload │ (preload.ts)                     │
│         └────┬────┘                                  │
│              │ ipcRenderer.invoke()                  │
│──────────────┼───────────────────────────────────────│
│              ▼            Main Process               │
│  ┌───────────────────┐                               │
│  │   IPC Handlers    │ (validated input)             │
│  └─────────┬─────────┘                               │
│            │                                         │
│  ┌─────────┼──────────────────────────┐              │
│  │         ▼                          │              │
│  │  ┌─────────────┐  ┌────────────┐  │              │
│  │  │Trust Monitor│  │  Gateway   │  │              │
│  │  │(orchestrator)│  │  Client   │◄─┼──► Gateway   │
│  │  └──────┬──────┘  └────────────┘  │    (FastAPI) │
│  │         │                          │              │
│  │  ┌──────┼──────────────────┐       │              │
│  │  │  Adapters               │       │              │
│  │  │ ┌─────┐┌─────┐┌──────┐│       │              │
│  │  │ │Zoom ││Teams││Email ││       │              │
│  │  │ └─────┘└─────┘└──────┘│       │              │
│  │  │ ┌─────┐┌──────────┐   │       │              │
│  │  │ │File ││API Listen││   │       │              │
│  │  │ └─────┘└──────────┘   │       │              │
│  │  └────────────────────────┘       │              │
│  │                                    │              │
│  │  ┌──────────────┐ ┌────────────┐  │              │
│  │  │Evidence Store│ │  Policy    │  │              │
│  │  │(SQLite+AES) │ │  Enforcer  │  │              │
│  │  └──────────────┘ └────────────┘  │              │
│  └────────────────────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

## Package Structure

### @qshield/core
Shared trust engine package. Contains:
- **Trust Scorer** — Weighted multi-signal scoring algorithm
- **Crypto** — HMAC-SHA256, AES-256-GCM, PBKDF2 key derivation
- **Evidence** — Hash chain evidence record generation and verification
- **Policy Rules** — Policy condition evaluation engine
- **Types** — All shared TypeScript interfaces

### @qshield/desktop
Electron application with two process contexts:

**Main Process (electron/):**
- Window management (main window, shield overlay, tray)
- IPC handler registration with input validation
- Service orchestration (trust monitor, policy enforcer, evidence store)
- Gateway API client and WebSocket connection
- Adapter management (Zoom, Teams, Email, File, API)
- Encrypted SQLite storage
- PDF certificate generation

**Renderer Process (src/):**
- React 19 components with TailwindCSS 4
- Zustand state management
- React Router (HashRouter for Electron)
- Typed IPC hooks wrapping window.qshield

## Security Architecture

1. **Process Isolation**: nodeIntegration disabled, contextIsolation enabled, sandbox enabled
2. **IPC Validation**: All inputs validated in main process before processing
3. **CSP Headers**: Strict Content-Security-Policy on all responses
4. **Encrypted Storage**: AES-256-GCM at-rest encryption for evidence database
5. **Hash Chain**: HMAC-SHA256 evidence records forming tamper-evident chain
6. **Key Derivation**: PBKDF2 with 100,000 iterations for master key

## Data Flow

1. Adapters emit events from communication channels
2. Trust Monitor aggregates events into trust signals
3. Trust Scorer computes weighted trust state
4. Evidence records created with hash chain linking
5. Policy Enforcer evaluates rules against trust state
6. Alerts generated for policy violations
7. State pushed to renderer via IPC events
8. Evidence stored in encrypted SQLite database
