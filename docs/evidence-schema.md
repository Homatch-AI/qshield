# QShield Desktop — Evidence Schema

## Overview

Evidence records form a cryptographic hash chain that provides tamper-evident logging of all monitored events. Each record's hash depends on the previous record, creating an append-only chain that can be verified.

## Hash Chain

```
Genesis Record          Record 2              Record 3
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ id: uuid-1   │       │ id: uuid-2   │       │ id: uuid-3   │
│ prevHash: ∅  │──────►│ prevHash: H1 │──────►│ prevHash: H2 │
│ hash: H1     │       │ hash: H2     │       │ hash: H3     │
│ source: zoom │       │ source: teams│       │ source: email│
│ payload: ... │       │ payload: ... │       │ payload: ... │
└──────────────┘       └──────────────┘       └──────────────┘
```

## Hash Computation

Each record's hash is computed as:

```
hash = HMAC-SHA256(
  key: per-instance HMAC key,
  data: id | previousHash | timestamp | source | eventType | payload
)
```

- Fields are joined with `|` separator
- `previousHash` is replaced with `"genesis"` for the first record
- Payload is JSON-stringified before hashing

## SQLite Schema

### evidence_records

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | UUID v4 |
| `hash` | TEXT NOT NULL UNIQUE | HMAC-SHA256 hex (64 chars) |
| `previous_hash` | TEXT | Link to previous record's hash |
| `timestamp` | TEXT NOT NULL | ISO 8601 timestamp |
| `source` | TEXT NOT NULL | Adapter type (zoom/teams/email/file/api) |
| `event_type` | TEXT NOT NULL | Event classification |
| `payload` | TEXT NOT NULL | Encrypted JSON (AES-256-GCM) |
| `verified` | INTEGER DEFAULT 0 | Hash verification status |
| `signature` | TEXT | Future: Ed25519 signature |
| `created_at` | TEXT | Database insertion time |

**Indexes:** timestamp, source, event_type, verified

### evidence_fts (FTS5 Virtual Table)

Full-text search index covering: id, source, event_type, payload.

### certificates

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | UUID v4 |
| `session_id` | TEXT NOT NULL | Monitoring session ID |
| `generated_at` | TEXT NOT NULL | Certificate generation time |
| `trust_score` | REAL NOT NULL | Trust score at generation |
| `trust_level` | TEXT NOT NULL | Trust level classification |
| `evidence_count` | INTEGER NOT NULL | Number of evidence records |
| `evidence_hashes` | TEXT NOT NULL | JSON array of included hashes |
| `signature_chain` | TEXT NOT NULL | HMAC of all evidence hashes |
| `pdf_path` | TEXT | Path to generated PDF file |
| `created_at` | TEXT | Database insertion time |

### alerts

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | UUID v4 |
| `severity` | TEXT NOT NULL | critical/high/medium/low |
| `title` | TEXT NOT NULL | Alert title |
| `description` | TEXT NOT NULL | Alert description |
| `source` | TEXT NOT NULL | Triggering adapter |
| `timestamp` | TEXT NOT NULL | Alert generation time |
| `dismissed` | INTEGER DEFAULT 0 | Dismissal status |
| `action_taken` | TEXT | Action description |
| `created_at` | TEXT | Database insertion time |

**Indexes:** severity, dismissed

### app_metadata

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PRIMARY KEY | Setting key |
| `value` | TEXT NOT NULL | Setting value (JSON) |
| `updated_at` | TEXT | Last update time |

## Encryption

- **At-rest encryption**: Evidence payload field encrypted with AES-256-GCM
- **Key derivation**: Master key derived via PBKDF2 (100,000 iterations) from machine-specific secret
- **Per-record**: Each payload encrypted with the derived key; IV generated per encryption
- **Stored format**: `{ ciphertext, iv, authTag }` JSON string in payload column

## Verification

1. **Single record**: Recompute HMAC from record fields, compare to stored hash
2. **Chain verification**: Verify all individual records + check previousHash linking
3. **Signature chain**: HMAC of concatenated record hashes for certificate generation
