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
// SQL schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  previous_hash TEXT,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Metadata keys stored in the app_metadata table. */
const META_MASTER_SECRET = 'master_secret';
const META_SALT = 'encryption_salt';

// ---------------------------------------------------------------------------
// EvidenceStore
// ---------------------------------------------------------------------------

export class EvidenceStore {
  private db: Database.Database;
  private encryptionKey: Buffer;
  private hmacKey: string;

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

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(app.getPath('userData'), 'evidence.db');
    log.info(`EvidenceStore: opening database at ${resolvedPath}`);

    this.db = new Database(resolvedPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Create schema
    this.db.exec(SCHEMA_SQL);

    // Derive encryption key from machine-specific master secret
    const { encryptionKey, hmacKey } = this.initCrypto();
    this.encryptionKey = encryptionKey;
    this.hmacKey = hmacKey;

    // Prepare commonly-used statements
    this.prepareStatements();

    log.info('EvidenceStore: initialized successfully');
  }

  // -----------------------------------------------------------------------
  // Crypto initialisation
  // -----------------------------------------------------------------------

  private initCrypto(): { encryptionKey: Buffer; hmacKey: string } {
    // Prepare metadata helpers early (before the rest of prepareStatements)
    this.stmtGetMeta = this.db.prepare('SELECT value FROM app_metadata WHERE key = ?');
    this.stmtSetMeta = this.db.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );

    // Retrieve or generate master secret
    let masterSecret = this.getMeta(META_MASTER_SECRET);
    if (!masterSecret) {
      masterSecret = generateRandomHex(64);
      this.setMeta(META_MASTER_SECRET, masterSecret);
      log.info('EvidenceStore: generated new master secret');
    }

    // Retrieve or generate salt
    let saltHex = this.getMeta(META_SALT);
    if (!saltHex) {
      const salt = generateSalt(32);
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
      `INSERT INTO evidence_records (id, hash, previous_hash, timestamp, source, event_type, payload, verified, signature)
       VALUES (@id, @hash, @previousHash, @timestamp, @source, @eventType, @payload, @verified, @signature)`,
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
  }

  // -----------------------------------------------------------------------
  // Payload encryption / decryption
  // -----------------------------------------------------------------------

  private encryptPayload(payload: Record<string, unknown>): string {
    const plaintext = JSON.stringify(payload);
    const encrypted: EncryptedData = encryptAesGcm(plaintext, this.encryptionKey);
    return JSON.stringify(encrypted);
  }

  private decryptPayload(encryptedJson: string): Record<string, unknown> {
    try {
      const encrypted: EncryptedData = JSON.parse(encryptedJson);
      const plaintext = decryptAesGcm(encrypted, this.encryptionKey);
      return JSON.parse(plaintext) as Record<string, unknown>;
    } catch (err) {
      log.error('EvidenceStore: failed to decrypt payload', err);
      // Return a sentinel so callers can detect the issue without crashing
      return { _decryptionError: true };
    }
  }

  // -----------------------------------------------------------------------
  // Row mapping helpers
  // -----------------------------------------------------------------------

  private rowToRecord(row: Record<string, unknown>): EvidenceRecord {
    return {
      id: row.id as string,
      hash: row.hash as string,
      previousHash: (row.previous_hash as string) ?? null,
      timestamp: row.timestamp as string,
      source: row.source as EvidenceRecord['source'],
      eventType: row.event_type as string,
      payload: this.decryptPayload(row.payload as string),
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
   * The payload is encrypted before storage and the FTS index is updated.
   */
  addRecord(record: EvidenceRecord): void {
    const encryptedPayload = this.encryptPayload(record.payload);

    const insertTx = this.db.transaction(() => {
      this.stmtInsertRecord.run({
        id: record.id,
        hash: record.hash,
        previousHash: record.previousHash,
        timestamp: record.timestamp,
        source: record.source,
        eventType: record.eventType,
        payload: encryptedPayload,
        verified: record.verified ? 1 : 0,
        signature: record.signature ?? null,
      });

      // Mirror plaintext-safe fields into FTS (payload stored as encrypted blob
      // here too – FTS on encrypted data is intentional so we can still match
      // source / event_type; the payload column in FTS is the encrypted form).
      this.stmtInsertFts.run({
        id: record.id,
        source: record.source,
        eventType: record.eventType,
        payload: encryptedPayload,
      });
    });

    insertTx();
    log.info(`EvidenceStore: added record ${record.id}`);
  }

  /**
   * Fetch a single record by ID, decrypting the payload.
   */
  getRecord(id: string): EvidenceRecord | null {
    const row = this.stmtGetRecord.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  /**
   * Paginated list of evidence records with decryption.
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
   * Re-computes the HMAC and verifies the previous-hash linkage.
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
   */
  listAlerts(): Alert[] {
    const rows = this.stmtListAlerts.all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToAlert(r));
  }

  /**
   * Mark an alert as dismissed.
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
