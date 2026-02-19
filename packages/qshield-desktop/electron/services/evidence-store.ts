import Database, { type Statement } from 'better-sqlite3';
import log from 'electron-log';
import { app } from 'electron';
import path from 'node:path';
import {
  deriveKey,
  generateSalt,
  generateRandomHex,
  encryptAesGcm,
  decryptAesGcm,
  rotateKey,
  hashEvidenceRecord,
  hmacSha256,
  type EncryptedData,
} from '@qshield/core';
import type {
  EvidenceRecord,
  Alert,
  TrustCertificate,
  ListOptions,
  ListResult,
} from '@qshield/core';

// ---------------------------------------------------------------------------
// SQL schema – versioned migrations
// ---------------------------------------------------------------------------

/** Current schema version. Increment when adding migrations. */
const CURRENT_SCHEMA_VERSION = 2;

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  previous_hash TEXT,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  iv TEXT,
  auth_tag TEXT,
  verified INTEGER DEFAULT 0,
  signature TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_timestamp ON evidence_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence_records(source);
CREATE INDEX IF NOT EXISTS idx_evidence_event_type ON evidence_records(event_type);
CREATE INDEX IF NOT EXISTS idx_evidence_verified ON evidence_records(verified);

CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(
  id, source, event_type, payload,
  content='evidence_records', content_rowid='rowid'
);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  trust_score REAL NOT NULL,
  trust_level TEXT NOT NULL,
  evidence_count INTEGER NOT NULL,
  evidence_hashes TEXT NOT NULL,
  signature_chain TEXT NOT NULL,
  pdf_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  dismissed INTEGER DEFAULT 0,
  action_taken TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_dismissed ON alerts(dismissed);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
`;

const MIGRATION_V2 = `
-- Add IV and auth_tag columns if they don't exist (safe for re-runs)
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check via pragma
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);
`;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/** Base error class for evidence store operations. */
export class EvidenceStoreError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'EvidenceStoreError';
  }
}

/** Thrown when a record cannot be found. */
export class RecordNotFoundError extends EvidenceStoreError {
  constructor(id: string) {
    super(`Record not found: ${id}`, 'RECORD_NOT_FOUND');
    this.name = 'RecordNotFoundError';
  }
}

/** Thrown when decryption fails. */
export class DecryptionError extends EvidenceStoreError {
  constructor(recordId: string, cause?: Error) {
    super(`Failed to decrypt record ${recordId}: ${cause?.message ?? 'unknown error'}`, 'DECRYPTION_FAILED');
    this.name = 'DecryptionError';
  }
}

/** Thrown when the storage quota is exceeded. */
export class QuotaExceededError extends EvidenceStoreError {
  constructor(currentSizeBytes: number, maxSizeBytes: number) {
    super(
      `Storage quota exceeded: ${(currentSizeBytes / 1024 / 1024).toFixed(1)}MB / ${(maxSizeBytes / 1024 / 1024).toFixed(1)}MB`,
      'QUOTA_EXCEEDED',
    );
    this.name = 'QuotaExceededError';
  }
}

// ---------------------------------------------------------------------------
// Store configuration
// ---------------------------------------------------------------------------

/** Configuration for the evidence store. */
export interface EvidenceStoreConfig {
  /** Maximum storage size in bytes (default: 500MB). */
  maxStorageBytes: number;
  /** Number of oldest records to prune when quota is exceeded. */
  pruneCount: number;
}

const DEFAULT_CONFIG: EvidenceStoreConfig = {
  maxStorageBytes: 500 * 1024 * 1024, // 500MB
  pruneCount: 100,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Metadata keys stored in the app_metadata table. */
const META_MASTER_SECRET = 'master_secret';
const META_SALT = 'encryption_salt';
const META_SCHEMA_VERSION = 'schema_version';

// ---------------------------------------------------------------------------
// EvidenceStore
// ---------------------------------------------------------------------------

/**
 * Production SQLite-backed evidence store with encryption at rest.
 *
 * All evidence record payloads are encrypted using AES-256-GCM before
 * storage. Each record has its own randomly generated IV stored in a
 * separate column. Key derivation uses PBKDF2 with SHA-512.
 *
 * Features:
 * - Per-record AES-256-GCM encryption with unique IVs
 * - PBKDF2 key derivation (100k iterations, SHA-512)
 * - Key rotation support (re-encrypts all records)
 * - Storage quota enforcement with automatic pruning
 * - Full-text search via SQLite FTS5
 * - Database migration versioning
 */
export class EvidenceStore {
  private db: Database.Database;
  private encryptionKey: Buffer;
  private hmacKey: string;
  private config: EvidenceStoreConfig;

  // Prepared statements – lazily created after schema init
  private stmtInsertRecord!: Statement;
  private stmtInsertFts!: Statement;
  private stmtGetRecord!: Statement;
  private stmtGetLastHash!: Statement;
  private stmtVerifyGetChain!: Statement;
  private stmtInsertAlert!: Statement;
  private stmtListAlerts!: Statement;
  private stmtDismissAlert!: Statement;
  private stmtInsertCert!: Statement;
  private stmtListCerts!: Statement;
  private stmtGetMeta!: Statement;
  private stmtSetMeta!: Statement;
  private stmtDbSize!: Statement;
  private stmtPruneOldest!: Statement;
  private stmtRecordCount!: Statement;

  private providedMasterSecret: string | undefined;

  /**
   * Create a new EvidenceStore instance.
   *
   * @param dbPath - Path to the SQLite database file (default: app userData)
   * @param config - Optional store configuration overrides
   * @param masterSecret - Optional master secret from KeyManager (preferred over SQLite-stored one)
   */
  constructor(dbPath?: string, config?: Partial<EvidenceStoreConfig>, masterSecret?: string) {
    this.providedMasterSecret = masterSecret;
    this.config = { ...DEFAULT_CONFIG, ...config };

    const resolvedPath = dbPath ?? path.join(app.getPath('userData'), 'evidence.db');
    log.info(`EvidenceStore: opening database at ${resolvedPath}`);

    this.db = new Database(resolvedPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Run migrations
    this.runMigrations();

    // Derive encryption key from machine-specific master secret
    const { encryptionKey, hmacKey } = this.initCrypto();
    this.encryptionKey = encryptionKey;
    this.hmacKey = hmacKey;

    // Prepare commonly-used statements
    this.prepareStatements();

    log.info('EvidenceStore: initialized successfully');
  }

  // -----------------------------------------------------------------------
  // Schema migrations
  // -----------------------------------------------------------------------

  /**
   * Run pending database migrations.
   * Tracks applied versions in the app_metadata table.
   */
  private runMigrations(): void {
    // Always run the base schema (CREATE IF NOT EXISTS is idempotent)
    this.db.exec(MIGRATION_V1);
    this.db.exec(MIGRATION_V2);

    // Check current version
    const versionStmt = this.db.prepare('SELECT value FROM app_metadata WHERE key = ?');
    const row = versionStmt.get(META_SCHEMA_VERSION) as { value: string } | undefined;
    const currentVersion = row ? parseInt(row.value, 10) : 0;

    if (currentVersion < 2) {
      // Check if iv column exists
      const columns = this.db.pragma('table_info(evidence_records)') as Array<{ name: string }>;
      const hasIv = columns.some((c) => c.name === 'iv');
      if (!hasIv) {
        this.db.exec('ALTER TABLE evidence_records ADD COLUMN iv TEXT');
        this.db.exec('ALTER TABLE evidence_records ADD COLUMN auth_tag TEXT');
        log.info('EvidenceStore: migrated to v2 — added iv and auth_tag columns');
      }
    }

    // Update version
    this.db.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(META_SCHEMA_VERSION, String(CURRENT_SCHEMA_VERSION));
  }

  // -----------------------------------------------------------------------
  // Crypto initialisation
  // -----------------------------------------------------------------------

  /**
   * Initialize encryption keys from stored or newly generated secrets.
   * Uses PBKDF2 with SHA-512 for key derivation.
   */
  private initCrypto(): { encryptionKey: Buffer; hmacKey: string } {
    // Prepare metadata helpers early (before the rest of prepareStatements)
    this.stmtGetMeta = this.db.prepare('SELECT value FROM app_metadata WHERE key = ?');
    this.stmtSetMeta = this.db.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );

    // Prefer master secret from KeyManager, fall back to SQLite-stored one
    let masterSecret = this.providedMasterSecret ?? this.getMeta(META_MASTER_SECRET);
    if (!masterSecret) {
      masterSecret = generateRandomHex(64);
      log.info('EvidenceStore: generated new master secret (legacy fallback)');
    }
    // Always write to SQLite for backward compatibility
    this.setMeta(META_MASTER_SECRET, masterSecret);

    // Retrieve or generate salt (16 bytes for PBKDF2)
    let saltHex = this.getMeta(META_SALT);
    if (!saltHex) {
      const salt = generateSalt(16);
      saltHex = salt.toString('hex');
      this.setMeta(META_SALT, saltHex);
      log.info('EvidenceStore: generated new encryption salt');
    }

    const salt = Buffer.from(saltHex, 'hex');
    const encryptionKey = deriveKey(masterSecret, salt);

    // Derive a separate HMAC key from the master secret for hash-chain integrity
    const hmacKey = hmacSha256(masterSecret, 'qshield-hmac-key');

    return { encryptionKey, hmacKey };
  }

  // -----------------------------------------------------------------------
  // Metadata helpers
  // -----------------------------------------------------------------------

  private getMeta(key: string): string | null {
    const row = this.stmtGetMeta.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.stmtSetMeta.run(key, value);
  }

  // -----------------------------------------------------------------------
  // Prepared statements
  // -----------------------------------------------------------------------

  private prepareStatements(): void {
    this.stmtInsertRecord = this.db.prepare(
      `INSERT INTO evidence_records (id, hash, previous_hash, timestamp, source, event_type, payload, iv, auth_tag, verified, signature)
       VALUES (@id, @hash, @previousHash, @timestamp, @source, @eventType, @payload, @iv, @authTag, @verified, @signature)`,
    );

    this.stmtInsertFts = this.db.prepare(
      `INSERT INTO evidence_fts (id, source, event_type, payload)
       VALUES (@id, @source, @eventType, @payload)`,
    );

    this.stmtGetRecord = this.db.prepare(
      'SELECT * FROM evidence_records WHERE id = ?',
    );

    this.stmtGetLastHash = this.db.prepare(
      'SELECT hash FROM evidence_records ORDER BY timestamp DESC, created_at DESC LIMIT 1',
    );

    this.stmtVerifyGetChain = this.db.prepare(
      'SELECT * FROM evidence_records ORDER BY timestamp ASC, created_at ASC',
    );

    this.stmtInsertAlert = this.db.prepare(
      `INSERT INTO alerts (id, severity, title, description, source, timestamp, dismissed, action_taken)
       VALUES (@id, @severity, @title, @description, @source, @timestamp, @dismissed, @actionTaken)`,
    );

    this.stmtListAlerts = this.db.prepare(
      'SELECT * FROM alerts WHERE dismissed = 0 ORDER BY timestamp DESC',
    );

    this.stmtDismissAlert = this.db.prepare(
      'UPDATE alerts SET dismissed = 1 WHERE id = ?',
    );

    this.stmtInsertCert = this.db.prepare(
      `INSERT INTO certificates (id, session_id, generated_at, trust_score, trust_level, evidence_count, evidence_hashes, signature_chain, pdf_path)
       VALUES (@id, @sessionId, @generatedAt, @trustScore, @trustLevel, @evidenceCount, @evidenceHashes, @signatureChain, @pdfPath)`,
    );

    this.stmtListCerts = this.db.prepare(
      'SELECT * FROM certificates ORDER BY generated_at DESC',
    );

    this.stmtDbSize = this.db.prepare(
      'SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()',
    );

    this.stmtPruneOldest = this.db.prepare(
      'DELETE FROM evidence_records WHERE id IN (SELECT id FROM evidence_records ORDER BY timestamp ASC LIMIT ?)',
    );

    this.stmtRecordCount = this.db.prepare(
      'SELECT COUNT(*) AS cnt FROM evidence_records',
    );
  }

  // -----------------------------------------------------------------------
  // Payload encryption / decryption (per-record IV)
  // -----------------------------------------------------------------------

  /**
   * Encrypt a payload for storage. Returns the encrypted components separately
   * so the IV and auth tag can be stored in dedicated columns.
   */
  private encryptPayload(payload: Record<string, unknown>): { ciphertext: string; iv: string; authTag: string } {
    const plaintext = JSON.stringify(payload);
    const encrypted: EncryptedData = encryptAesGcm(plaintext, this.encryptionKey);
    return {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    };
  }

  /**
   * Decrypt a payload from storage using per-record IV and auth tag.
   * Falls back to legacy format (JSON-encoded EncryptedData in payload column).
   */
  private decryptPayload(
    recordId: string,
    ciphertext: string,
    iv: string | null,
    authTag: string | null,
  ): Record<string, unknown> {
    try {
      let encrypted: EncryptedData;

      if (iv && authTag) {
        // New format: IV and authTag in separate columns
        encrypted = { ciphertext, iv, authTag };
      } else {
        // Legacy format: payload column contains JSON-encoded EncryptedData
        encrypted = JSON.parse(ciphertext) as EncryptedData;
      }

      const plaintext = decryptAesGcm(encrypted, this.encryptionKey);
      return JSON.parse(plaintext) as Record<string, unknown>;
    } catch (err) {
      log.error(`EvidenceStore: failed to decrypt payload for record ${recordId}`, err);
      throw new DecryptionError(recordId, err instanceof Error ? err : undefined);
    }
  }

  // -----------------------------------------------------------------------
  // Storage quota management
  // -----------------------------------------------------------------------

  /**
   * Get the current database size in bytes.
   * @returns The size of the database file in bytes
   */
  getStorageSize(): number {
    const row = this.stmtDbSize.get() as { size: number } | undefined;
    return row?.size ?? 0;
  }

  /**
   * Get the total number of evidence records.
   * @returns The count of evidence records
   */
  getRecordCount(): number {
    const row = this.stmtRecordCount.get() as { cnt: number };
    return row.cnt;
  }

  /**
   * Enforce storage quota by pruning the oldest records if the database
   * exceeds the configured maximum size.
   * @returns Number of records pruned
   */
  enforceQuota(): number {
    const currentSize = this.getStorageSize();
    if (currentSize <= this.config.maxStorageBytes) return 0;

    let totalPruned = 0;
    // Prune in batches until under quota or no records left
    while (this.getStorageSize() > this.config.maxStorageBytes && this.getRecordCount() > 0) {
      const result = this.stmtPruneOldest.run(this.config.pruneCount);
      totalPruned += result.changes;
      if (result.changes === 0) break; // Safety: no more records to prune
    }

    if (totalPruned > 0) {
      log.info(`EvidenceStore: pruned ${totalPruned} records to enforce storage quota`);
    }

    return totalPruned;
  }

  // -----------------------------------------------------------------------
  // Key rotation
  // -----------------------------------------------------------------------

  /**
   * Rotate the encryption key by re-encrypting all stored records.
   *
   * Generates a new master secret and salt, derives a new encryption key,
   * then re-encrypts every record's payload in a single transaction.
   * If any step fails, the entire operation is rolled back.
   *
   * @returns The number of records re-encrypted
   */
  rotateEncryptionKey(): number {
    const oldKey = this.encryptionKey;

    // Generate new credentials
    const newMasterSecret = generateRandomHex(64);
    const newSalt = generateSalt(16);
    const newKey = deriveKey(newMasterSecret, newSalt);

    // Collect all encrypted records
    const rows = this.db.prepare('SELECT id, payload, iv, auth_tag FROM evidence_records').all() as Array<{
      id: string;
      payload: string;
      iv: string | null;
      auth_tag: string | null;
    }>;

    const reEncryptTx = this.db.transaction(() => {
      const updateStmt = this.db.prepare(
        'UPDATE evidence_records SET payload = ?, iv = ?, auth_tag = ? WHERE id = ?',
      );

      for (const row of rows) {
        // Decrypt with old key
        let encrypted: EncryptedData;
        if (row.iv && row.auth_tag) {
          encrypted = { ciphertext: row.payload, iv: row.iv, authTag: row.auth_tag };
        } else {
          encrypted = JSON.parse(row.payload) as EncryptedData;
        }

        // Re-encrypt with new key
        const [reEncrypted] = rotateKey([encrypted], oldKey, newKey);
        updateStmt.run(reEncrypted.ciphertext, reEncrypted.iv, reEncrypted.authTag, row.id);
      }

      // Update stored credentials
      this.setMeta(META_MASTER_SECRET, newMasterSecret);
      this.setMeta(META_SALT, newSalt.toString('hex'));
    });

    reEncryptTx();

    // Update in-memory key
    this.encryptionKey = newKey;
    this.hmacKey = hmacSha256(newMasterSecret, 'qshield-hmac-key');

    log.info(`EvidenceStore: rotated encryption key, re-encrypted ${rows.length} records`);
    return rows.length;
  }

  // -----------------------------------------------------------------------
  // Row mapping helpers
  // -----------------------------------------------------------------------

  private rowToRecord(row: Record<string, unknown>): EvidenceRecord {
    const payload = this.decryptPayload(
      row.id as string,
      row.payload as string,
      (row.iv as string) ?? null,
      (row.auth_tag as string) ?? null,
    );

    return {
      id: row.id as string,
      hash: row.hash as string,
      previousHash: (row.previous_hash as string) ?? null,
      timestamp: row.timestamp as string,
      source: row.source as EvidenceRecord['source'],
      eventType: row.event_type as string,
      payload,
      verified: (row.verified as number) === 1,
      signature: (row.signature as string) ?? undefined,
    };
  }

  private rowToAlert(row: Record<string, unknown>): Alert {
    return {
      id: row.id as string,
      severity: row.severity as Alert['severity'],
      title: row.title as string,
      description: row.description as string,
      source: row.source as Alert['source'],
      timestamp: row.timestamp as string,
      dismissed: (row.dismissed as number) === 1,
      actionTaken: (row.action_taken as string) ?? undefined,
    };
  }

  private rowToCertificate(row: Record<string, unknown>): TrustCertificate {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      generatedAt: row.generated_at as string,
      trustScore: row.trust_score as number,
      trustLevel: row.trust_level as TrustCertificate['trustLevel'],
      evidenceCount: row.evidence_count as number,
      evidenceHashes: JSON.parse(row.evidence_hashes as string) as string[],
      signatureChain: row.signature_chain as string,
      pdfPath: (row.pdf_path as string) ?? undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Public API – Evidence Records
  // -----------------------------------------------------------------------

  /**
   * Insert a new evidence record.
   *
   * The payload is encrypted with AES-256-GCM using a unique per-record IV
   * before storage. The IV and auth tag are stored in dedicated columns.
   * The FTS index is updated in the same transaction.
   * Storage quota is enforced after insertion.
   *
   * @param record - The evidence record to store
   * @throws {QuotaExceededError} If quota enforcement fails
   */
  addRecord(record: EvidenceRecord): void {
    const { ciphertext, iv, authTag } = this.encryptPayload(record.payload);

    const insertTx = this.db.transaction(() => {
      this.stmtInsertRecord.run({
        id: record.id,
        hash: record.hash,
        previousHash: record.previousHash,
        timestamp: record.timestamp,
        source: record.source,
        eventType: record.eventType,
        payload: ciphertext,
        iv,
        authTag,
        verified: record.verified ? 1 : 0,
        signature: record.signature ?? null,
      });

      // Mirror searchable fields into FTS (source and event_type are plaintext)
      this.stmtInsertFts.run({
        id: record.id,
        source: record.source,
        eventType: record.eventType,
        payload: record.source + ' ' + record.eventType,
      });
    });

    insertTx();

    // Enforce storage quota (prune oldest if exceeded)
    this.enforceQuota();

    log.info(`EvidenceStore: added record ${record.id}`);
  }

  /**
   * Fetch a single record by ID, decrypting the payload.
   *
   * @param id - The UUID of the record to fetch
   * @returns The decrypted evidence record, or null if not found
   */
  getRecord(id: string): EvidenceRecord | null {
    const row = this.stmtGetRecord.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  /**
   * Paginated list of evidence records with decryption.
   *
   * Supports filtering by source, event type, and verified status.
   * Sort columns are whitelisted to prevent SQL injection.
   *
   * @param opts - Pagination, sorting, and filtering options
   * @returns Paginated result with decrypted evidence records
   */
  listRecords(opts: ListOptions): ListResult<EvidenceRecord> {
    const { page, pageSize, sortBy, sortOrder, filter } = opts;

    // Build dynamic query
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter) {
      if (filter.source) {
        conditions.push('source = ?');
        params.push(filter.source);
      }
      if (filter.eventType) {
        conditions.push('event_type = ?');
        params.push(filter.eventType);
      }
      if (filter.verified !== undefined) {
        conditions.push('verified = ?');
        params.push(filter.verified ? 1 : 0);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Allowed sort columns (whitelist to prevent SQL injection)
    const allowedSorts: Record<string, string> = {
      timestamp: 'timestamp',
      source: 'source',
      eventType: 'event_type',
      createdAt: 'created_at',
    };
    const orderColumn = (sortBy && allowedSorts[sortBy]) ?? 'timestamp';
    const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Count
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM evidence_records ${whereClause}`)
      .get(...params) as { cnt: number };
    const total = countRow.cnt;

    // Fetch page
    const offset = (page - 1) * pageSize;
    const rows = this.db
      .prepare(
        `SELECT * FROM evidence_records ${whereClause} ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[];

    const items = rows.map((r) => this.rowToRecord(r));

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Verify the hash chain integrity for a single record.
   *
   * Re-computes the HMAC and verifies the previous-hash linkage.
   *
   * @param id - The UUID of the record to verify
   * @returns Verification result with any errors
   */
  verifyRecord(id: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const row = this.stmtGetRecord.get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return { valid: false, errors: [`Record ${id} not found`] };
    }

    const record = this.rowToRecord(row);

    // Re-compute the hash
    const expectedHash = hashEvidenceRecord(
      {
        id: record.id,
        previousHash: record.previousHash,
        timestamp: record.timestamp,
        source: record.source,
        eventType: record.eventType,
        payload: JSON.stringify(record.payload),
      },
      this.hmacKey,
    );

    if (record.hash !== expectedHash) {
      errors.push(`Hash mismatch for record ${id}: expected ${expectedHash}, got ${record.hash}`);
    }

    // Verify chain linkage: if there is a previousHash, make sure that record exists
    if (record.previousHash !== null) {
      const prevRow = this.db
        .prepare('SELECT hash FROM evidence_records WHERE hash = ?')
        .get(record.previousHash) as { hash: string } | undefined;

      if (!prevRow) {
        errors.push(
          `Previous hash ${record.previousHash} referenced by record ${id} does not exist in the store`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Full-text search across evidence records via FTS5.
   *
   * Search terms are quoted to prevent FTS5 syntax injection.
   *
   * @param query - The search query string
   * @returns Paginated result of matching records
   */
  searchRecords(query: string): ListResult<EvidenceRecord> {
    // Sanitise the FTS query – wrap each term in double quotes to prevent
    // FTS5 syntax errors from user input.
    const sanitised = query
      .replace(/"/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"`)
      .join(' ');

    if (!sanitised) {
      return { items: [], total: 0, page: 1, pageSize: 0, hasMore: false };
    }

    const ftsRows = this.db
      .prepare(
        `SELECT er.*
         FROM evidence_fts fts
         JOIN evidence_records er ON er.id = fts.id
         WHERE evidence_fts MATCH ?
         ORDER BY rank
         LIMIT 100`,
      )
      .all(sanitised) as Record<string, unknown>[];

    const items = ftsRows.map((r) => this.rowToRecord(r));

    return {
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
      hasMore: false,
    };
  }

  /**
   * Export multiple records by ID, decrypting payloads.
   *
   * @param ids - Array of record UUIDs to export
   * @returns Array of decrypted evidence records
   */
  exportRecords(ids: string[]): EvidenceRecord[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM evidence_records WHERE id IN (${placeholders}) ORDER BY timestamp ASC`)
      .all(...ids) as Record<string, unknown>[];

    return rows.map((r) => this.rowToRecord(r));
  }

  /**
   * Get the hash of the most recent evidence record (for chain linking).
   *
   * @returns The hash of the latest record, or null if the store is empty
   */
  getLastHash(): string | null {
    const row = this.stmtGetLastHash.get() as { hash: string } | undefined;
    return row?.hash ?? null;
  }

  // -----------------------------------------------------------------------
  // Public API – Alerts
  // -----------------------------------------------------------------------

  /**
   * Insert a new alert.
   *
   * @param alert - The alert to persist
   */
  addAlert(alert: Alert): void {
    this.stmtInsertAlert.run({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      source: alert.source,
      timestamp: alert.timestamp,
      dismissed: alert.dismissed ? 1 : 0,
      actionTaken: alert.actionTaken ?? null,
    });
    log.info(`EvidenceStore: added alert ${alert.id} [${alert.severity}]`);
  }

  /**
   * List all non-dismissed alerts, most recent first.
   *
   * @returns Array of active (non-dismissed) alerts
   */
  listAlerts(): Alert[] {
    const rows = this.stmtListAlerts.all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToAlert(r));
  }

  /**
   * Mark an alert as dismissed.
   *
   * @param id - The UUID of the alert to dismiss
   */
  dismissAlert(id: string): void {
    this.stmtDismissAlert.run(id);
    log.info(`EvidenceStore: dismissed alert ${id}`);
  }

  // -----------------------------------------------------------------------
  // Public API – Certificates
  // -----------------------------------------------------------------------

  /**
   * Insert a trust certificate record.
   *
   * @param cert - The certificate to persist
   */
  addCertificate(cert: TrustCertificate): void {
    this.stmtInsertCert.run({
      id: cert.id,
      sessionId: cert.sessionId,
      generatedAt: cert.generatedAt,
      trustScore: cert.trustScore,
      trustLevel: cert.trustLevel,
      evidenceCount: cert.evidenceCount,
      evidenceHashes: JSON.stringify(cert.evidenceHashes),
      signatureChain: cert.signatureChain,
      pdfPath: cert.pdfPath ?? null,
    });
    log.info(`EvidenceStore: added certificate ${cert.id}`);
  }

  /**
   * List all trust certificates, most recent first.
   *
   * @returns Array of trust certificates
   */
  listCertificates(): TrustCertificate[] {
    const rows = this.stmtListCerts.all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToCertificate(r));
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Close the database connection. Must be called on app shutdown.
   */
  close(): void {
    log.info('EvidenceStore: closing database');
    this.db.close();
  }
}
