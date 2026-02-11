# QShield Desktop — IPC Channels

## Overview

All communication between the renderer and main process flows through typed IPC channels using Electron's `contextBridge` and `ipcMain.handle()` pattern.

The preload script exposes a `window.qshield` API that the renderer uses via custom hooks.

## Channel Reference

### Trust Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `trust:get-state` | invoke | none | `TrustState` | Get current trust state |
| `trust:subscribe` | invoke | none | `{ ok: true }` | Subscribe to trust updates |
| `trust:unsubscribe` | invoke | none | `{ ok: true }` | Unsubscribe from updates |

**Push Events:** `event:trust-state-updated` — pushed to renderer when trust state changes.

### Evidence Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `evidence:list` | invoke | `ListOptions` | `ListResult<EvidenceRecord>` | Paginated evidence list |
| `evidence:get` | invoke | `string (UUID)` | `EvidenceRecord` | Get single record |
| `evidence:verify` | invoke | `string (UUID)` | `{ valid, errors }` | Verify record hash |
| `evidence:search` | invoke | `string (query)` | `ListResult<EvidenceRecord>` | Full-text search |
| `evidence:export` | invoke | `string[]` | `EvidenceRecord[]` | Export multiple records |

### Certificate Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `cert:generate` | invoke | `CertOptions` | `TrustCertificate` | Generate PDF certificate |
| `cert:list` | invoke | none | `TrustCertificate[]` | List all certificates |

### Gateway Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `gateway:status` | invoke | none | `{ connected, url }` | Connection status |
| `gateway:connect` | invoke | `string (URL)` | `{ connected, url }` | Connect to gateway |
| `gateway:disconnect` | invoke | none | `{ connected: false }` | Disconnect |

**Push Events:** `event:gateway-connection-changed` — pushed on connection state change.

### Alert Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `alert:list` | invoke | none | `Alert[]` | List active alerts |
| `alert:dismiss` | invoke | `string (UUID)` | `Alert` | Dismiss an alert |
| `alert:subscribe` | invoke | none | `{ ok: true }` | Subscribe to new alerts |

**Push Events:** `event:alert-received` — pushed when new alert is generated.

### Policy Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `policy:get` | invoke | none | `PolicyConfig` | Get current policy |
| `policy:update` | invoke | `PolicyConfig` | `PolicyConfig` | Update policy rules |

### Config Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `config:get` | invoke | `string (key)` | `unknown` | Get config value |
| `config:set` | invoke | `string, unknown` | `void` | Set config value |

### Adapter Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `adapter:status` | invoke | none | `AdapterStatus[]` | All adapter statuses |
| `adapter:enable` | invoke | `string` | `{ id, enabled }` | Enable an adapter |
| `adapter:disable` | invoke | `string` | `{ id, enabled }` | Disable an adapter |

**Push Events:** `event:adapter-status-changed` — pushed when adapter status changes.

### App Channels

| Channel | Method | Args | Returns | Description |
|---------|--------|------|---------|-------------|
| `app:version` | invoke | none | `string` | App version |
| `app:quit` | invoke | none | `{ ok: true }` | Quit application |

## Input Validation

All IPC inputs are validated in `electron/ipc/validators.ts` before reaching service handlers:

- **Strings**: Non-empty, trimmed
- **UUIDs**: RFC 4122 v4 format
- **URLs**: Valid URL with http/https/ws/wss protocol
- **ListOptions**: page >= 1, pageSize 1-100, sortBy alphanumeric
- **Config keys**: Alphanumeric with dots/dashes/underscores
- **Adapter IDs**: Must be one of: zoom, teams, email, file, api

Validation errors return `{ error: string, code: 'VALIDATION_ERROR' }`.
