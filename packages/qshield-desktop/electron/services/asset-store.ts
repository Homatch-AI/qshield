import Database, { type Statement } from 'better-sqlite3';
import log from 'electron-log';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  HighTrustAsset,
  AssetSensitivity,
  AssetTrustState,
  AssetChangeEvent,
  AIProtectedZone,
  ZoneProtectionLevel,
} from '@qshield/core';

// ---------------------------------------------------------------------------
// SQL schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS high_trust_assets (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('file', 'directory')),
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK(sensitivity IN ('normal', 'strict', 'critical')),
  trust_state TEXT NOT NULL DEFAULT 'unverified' CHECK(trust_state IN ('verified', 'changed', 'unverified')),
  trust_score REAL NOT NULL DEFAULT 100,
  content_hash TEXT,
  verified_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_verified TEXT,
  last_changed TEXT,
  change_count INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_assets_path ON high_trust_assets(path);
CREATE INDEX IF NOT EXISTS idx_assets_trust_state ON high_trust_assets(trust_state);
CREATE INDEX IF NOT EXISTS idx_assets_sensitivity ON high_trust_assets(sensitivity);

CREATE TABLE IF NOT EXISTS asset_change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL REFERENCES high_trust_assets(id),
  event_type TEXT NOT NULL,
  previous_hash TEXT,
  new_hash TEXT,
  trust_state_before TEXT NOT NULL,
  trust_state_after TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT,
  evidence_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_change_log_asset ON asset_change_log(asset_id);
CREATE INDEX IF NOT EXISTS idx_change_log_timestamp ON asset_change_log(timestamp);

CREATE TABLE IF NOT EXISTS asset_metadata (
  asset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (asset_id, key),
  FOREIGN KEY (asset_id) REFERENCES high_trust_assets(id)
);

CREATE TABLE IF NOT EXISTS ai_protected_zones (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'directory',
  protection_level TEXT NOT NULL DEFAULT 'freeze',
  created_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  violation_count INTEGER NOT NULL DEFAULT 0,
  last_violation TEXT
);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute SHA-256 hash of a file's contents. */
function hashFile(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const content = fs.readFileSync(filePath);
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Compute a merkle-style hash for a directory.
 * Hashes each file individually, sorts the hashes, then hashes the
 * concatenated result. Only includes regular files (no symlinks).
 */
function hashDirectory(dirPath: string): string {
  const fileHashes: string[] = [];
  collectFileHashes(dirPath, fileHashes);
  fileHashes.sort();
  const combined = crypto.createHash('sha256');
  for (const h of fileHashes) {
    combined.update(h);
  }
  return combined.digest('hex');
}

function collectFileHashes(dirPath: string, hashes: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return; // skip unreadable directories
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      try {
        hashes.push(hashFile(fullPath));
      } catch {
        // skip unreadable files
      }
    } else if (entry.isDirectory() && !entry.isSymbolicLink()) {
      collectFileHashes(fullPath, hashes);
    }
  }
}

/** Map a SQLite row to a HighTrustAsset. */
function rowToAsset(row: Record<string, unknown>): HighTrustAsset {
  return {
    id: row.id as string,
    path: row.path as string,
    name: row.name as string,
    type: row.type as 'file' | 'directory',
    sensitivity: row.sensitivity as AssetSensitivity,
    trustState: row.trust_state as AssetTrustState,
    trustScore: row.trust_score as number,
    contentHash: (row.content_hash as string) ?? null,
    verifiedHash: (row.verified_hash as string) ?? null,
    createdAt: row.created_at as string,
    lastVerified: (row.last_verified as string) ?? null,
    lastChanged: (row.last_changed as string) ?? null,
    changeCount: row.change_count as number,
    evidenceCount: row.evidence_count as number,
    enabled: (row.enabled as number) === 1,
  };
}

/** Map a SQLite row to an AIProtectedZone. */
function rowToZone(row: Record<string, unknown>): AIProtectedZone {
  return {
    id: row.id as string,
    path: row.path as string,
    name: row.name as string,
    type: row.type as 'file' | 'directory',
    protectionLevel: row.protection_level as ZoneProtectionLevel,
    createdAt: row.created_at as string,
    enabled: (row.enabled as number) === 1,
    violationCount: row.violation_count as number,
    lastViolation: (row.last_violation as string) ?? null,
  };
}

/** Map a SQLite row to an AssetChangeEvent. */
function rowToChangeEvent(row: Record<string, unknown>): AssetChangeEvent {
  return {
    assetId: row.asset_id as string,
    path: '', // filled by caller if needed
    sensitivity: 'normal', // filled by caller if needed
    eventType: row.event_type as AssetChangeEvent['eventType'],
    previousHash: (row.previous_hash as string) ?? null,
    newHash: (row.new_hash as string) ?? null,
    trustStateBefore: row.trust_state_before as AssetTrustState,
    trustStateAfter: row.trust_state_after as AssetTrustState,
    timestamp: row.timestamp as string,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
  };
}

// ---------------------------------------------------------------------------
// AssetStore
// ---------------------------------------------------------------------------

/**
 * SQLite-backed store for high-trust assets.
 *
 * Stores registered files/directories, their trust state, content hashes,
 * and a change log for audit. Uses the same better-sqlite3 patterns as
 * EvidenceStore.
 */
export class AssetStore {
  private db: Database.Database;

  // Prepared statements
  private stmtInsert!: Statement;
  private stmtDelete!: Statement;
  private stmtGetById!: Statement;
  private stmtGetByPath!: Statement;
  private stmtListAll!: Statement;
  private stmtUpdateSensitivity!: Statement;
  private stmtSetEnabled!: Statement;
  private stmtUpdateHash!: Statement;
  private stmtVerify!: Statement;
  private stmtMarkChanged!: Statement;
  private stmtUpdateTrustScore!: Statement;
  private stmtInsertChangeLog!: Statement;
  private stmtGetChangeLog!: Statement;
  private stmtGetByState!: Statement;
  private stmtGetByDirectory!: Statement;
  private stmtIncrementEvidence!: Statement;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(app.getPath('userData'), 'assets.db');
    log.info(`[AssetStore] Opening database at ${resolvedPath}`);

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(SCHEMA);
    this.prepareStatements();

    log.info('[AssetStore] Initialized successfully');
  }

  // -----------------------------------------------------------------------
  // Prepared statements
  // -----------------------------------------------------------------------

  private prepareStatements(): void {
    this.stmtInsert = this.db.prepare(
      `INSERT INTO high_trust_assets
        (id, path, name, type, sensitivity, trust_state, trust_score, content_hash, verified_hash, created_at, last_verified, enabled)
       VALUES
        (@id, @path, @name, @type, @sensitivity, @trustState, @trustScore, @contentHash, @verifiedHash, @createdAt, @lastVerified, @enabled)`,
    );

    this.stmtDelete = this.db.prepare('DELETE FROM high_trust_assets WHERE id = ?');

    this.stmtGetById = this.db.prepare('SELECT * FROM high_trust_assets WHERE id = ?');

    this.stmtGetByPath = this.db.prepare('SELECT * FROM high_trust_assets WHERE path = ?');

    this.stmtListAll = this.db.prepare('SELECT * FROM high_trust_assets ORDER BY created_at DESC');

    this.stmtUpdateSensitivity = this.db.prepare(
      'UPDATE high_trust_assets SET sensitivity = ? WHERE id = ?',
    );

    this.stmtSetEnabled = this.db.prepare(
      'UPDATE high_trust_assets SET enabled = ? WHERE id = ?',
    );

    this.stmtUpdateHash = this.db.prepare(
      'UPDATE high_trust_assets SET content_hash = ? WHERE id = ?',
    );

    this.stmtVerify = this.db.prepare(
      `UPDATE high_trust_assets
       SET verified_hash = content_hash, trust_state = 'verified', last_verified = datetime('now'), trust_score = 100
       WHERE id = ?`,
    );

    this.stmtMarkChanged = this.db.prepare(
      `UPDATE high_trust_assets
       SET content_hash = ?, trust_state = 'changed', last_changed = datetime('now'), change_count = change_count + 1
       WHERE id = ?`,
    );

    this.stmtUpdateTrustScore = this.db.prepare(
      'UPDATE high_trust_assets SET trust_score = ? WHERE id = ?',
    );

    this.stmtInsertChangeLog = this.db.prepare(
      `INSERT INTO asset_change_log
        (asset_id, event_type, previous_hash, new_hash, trust_state_before, trust_state_after, timestamp, metadata, evidence_id)
       VALUES
        (@assetId, @eventType, @previousHash, @newHash, @trustStateBefore, @trustStateAfter, @timestamp, @metadata, @evidenceId)`,
    );

    this.stmtGetChangeLog = this.db.prepare(
      'SELECT * FROM asset_change_log WHERE asset_id = ? ORDER BY timestamp DESC LIMIT ?',
    );

    this.stmtGetByState = this.db.prepare(
      'SELECT * FROM high_trust_assets WHERE trust_state = ? ORDER BY created_at DESC',
    );

    this.stmtGetByDirectory = this.db.prepare(
      "SELECT * FROM high_trust_assets WHERE path LIKE ? || '%' ORDER BY path",
    );

    this.stmtIncrementEvidence = this.db.prepare(
      'UPDATE high_trust_assets SET evidence_count = evidence_count + 1 WHERE id = ?',
    );
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * Register a new high-trust asset.
   *
   * For files: computes SHA-256 immediately but starts as 'unverified'.
   * The user must explicitly verify the asset to establish the trusted baseline.
   * For directories: computes merkle hash of all contained files.
   */
  addAsset(
    assetPath: string,
    type: 'file' | 'directory',
    sensitivity: AssetSensitivity,
    name?: string,
  ): HighTrustAsset {
    const resolvedPath = path.resolve(assetPath);
    const displayName = name ?? path.basename(resolvedPath);
    const id = uuidv4();
    const now = new Date().toISOString();

    // Compute initial hash
    let contentHash: string | null = null;
    try {
      if (type === 'file') {
        contentHash = hashFile(resolvedPath);
      } else {
        contentHash = hashDirectory(resolvedPath);
      }
    } catch (err) {
      log.warn(`[AssetStore] Could not hash ${resolvedPath}:`, err);
    }

    this.stmtInsert.run({
      id,
      path: resolvedPath,
      name: displayName,
      type,
      sensitivity,
      trustState: 'unverified',
      trustScore: 100,
      contentHash,
      verifiedHash: null,
      createdAt: now,
      lastVerified: null,
      enabled: 1,
    });

    log.info(`[AssetStore] Added asset: ${displayName} (${type}, ${sensitivity}) → ${resolvedPath}`);
    return this.getAsset(id)!;
  }

  removeAsset(id: string): boolean {
    // Delete from child tables first (foreign key order)
    this.db.prepare('DELETE FROM asset_metadata WHERE asset_id = ?').run(id);
    this.db.prepare('DELETE FROM asset_change_log WHERE asset_id = ?').run(id);
    const result = this.stmtDelete.run(id);
    if (result.changes > 0) {
      log.info(`[AssetStore] Removed asset ${id}`);
    }
    return result.changes > 0;
  }

  getAsset(id: string): HighTrustAsset | null {
    const row = this.stmtGetById.get(id) as Record<string, unknown> | undefined;
    return row ? rowToAsset(row) : null;
  }

  getAssetByPath(assetPath: string): HighTrustAsset | null {
    const resolved = path.resolve(assetPath);
    const row = this.stmtGetByPath.get(resolved) as Record<string, unknown> | undefined;
    return row ? rowToAsset(row) : null;
  }

  listAssets(): HighTrustAsset[] {
    const rows = this.stmtListAll.all() as Record<string, unknown>[];
    return rows.map(rowToAsset);
  }

  updateSensitivity(id: string, sensitivity: AssetSensitivity): HighTrustAsset | null {
    this.stmtUpdateSensitivity.run(sensitivity, id);
    return this.getAsset(id);
  }

  enableAsset(id: string, enabled: boolean): boolean {
    const result = this.stmtSetEnabled.run(enabled ? 1 : 0, id);
    return result.changes > 0;
  }

  // -----------------------------------------------------------------------
  // Trust operations
  // -----------------------------------------------------------------------

  updateHash(id: string, newHash: string): void {
    this.stmtUpdateHash.run(newHash, id);
  }

  /**
   * Mark an asset as verified: sets verifiedHash = contentHash,
   * trustState = 'verified', trustScore = 100, lastVerified = now.
   */
  verifyAsset(id: string): HighTrustAsset | null {
    this.stmtVerify.run(id);
    return this.getAsset(id);
  }

  /**
   * Mark an asset as changed: updates contentHash, sets trustState = 'changed',
   * increments changeCount, sets lastChanged = now.
   */
  markChanged(id: string, newHash: string): void {
    this.stmtMarkChanged.run(newHash, id);
  }

  updateTrustScore(id: string, score: number): void {
    const clamped = Math.max(0, Math.min(100, score));
    this.stmtUpdateTrustScore.run(clamped, id);
  }

  /** Increment evidence_count by 1 for the given asset. */
  incrementEvidenceCount(id: string): void {
    this.stmtIncrementEvidence.run(id);
  }

  // -----------------------------------------------------------------------
  // Change log
  // -----------------------------------------------------------------------

  logChange(assetId: string, event: Omit<AssetChangeEvent, 'assetId'>): void {
    this.stmtInsertChangeLog.run({
      assetId,
      eventType: event.eventType,
      previousHash: event.previousHash,
      newHash: event.newHash,
      trustStateBefore: event.trustStateBefore,
      trustStateAfter: event.trustStateAfter,
      timestamp: event.timestamp,
      metadata: Object.keys(event.metadata).length > 0 ? JSON.stringify(event.metadata) : null,
      evidenceId: null,
    });
  }

  getChangeLog(assetId: string, limit = 50): AssetChangeEvent[] {
    const rows = this.stmtGetChangeLog.all(assetId, limit) as Record<string, unknown>[];
    const asset = this.getAsset(assetId);
    return rows.map((row) => {
      const event = rowToChangeEvent(row);
      event.assetId = assetId;
      event.path = asset?.path ?? '';
      event.sensitivity = asset?.sensitivity ?? 'normal';
      return event;
    });
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getAssetsByState(state: AssetTrustState): HighTrustAsset[] {
    const rows = this.stmtGetByState.all(state) as Record<string, unknown>[];
    return rows.map(rowToAsset);
  }

  /** Get all assets whose path starts with the given directory path. */
  getAssetsForPath(directoryPath: string): HighTrustAsset[] {
    const resolved = path.resolve(directoryPath);
    const rows = this.stmtGetByDirectory.all(resolved) as Record<string, unknown>[];
    return rows.map(rowToAsset);
  }

  getStats(): {
    total: number;
    verified: number;
    changed: number;
    unverified: number;
    bySensitivity: Record<AssetSensitivity, number>;
  } {
    const total = (
      this.db.prepare('SELECT COUNT(*) AS cnt FROM high_trust_assets').get() as { cnt: number }
    ).cnt;
    const verified = (
      this.db
        .prepare("SELECT COUNT(*) AS cnt FROM high_trust_assets WHERE trust_state = 'verified'")
        .get() as { cnt: number }
    ).cnt;
    const changed = (
      this.db
        .prepare("SELECT COUNT(*) AS cnt FROM high_trust_assets WHERE trust_state = 'changed'")
        .get() as { cnt: number }
    ).cnt;
    const unverified = (
      this.db
        .prepare("SELECT COUNT(*) AS cnt FROM high_trust_assets WHERE trust_state = 'unverified'")
        .get() as { cnt: number }
    ).cnt;

    const sensitivityRows = this.db
      .prepare('SELECT sensitivity, COUNT(*) AS cnt FROM high_trust_assets GROUP BY sensitivity')
      .all() as Array<{ sensitivity: string; cnt: number }>;

    const bySensitivity: Record<AssetSensitivity, number> = {
      normal: 0,
      strict: 0,
      critical: 0,
    };
    for (const row of sensitivityRows) {
      bySensitivity[row.sensitivity as AssetSensitivity] = row.cnt;
    }

    return { total, verified, changed, unverified, bySensitivity };
  }

  // -----------------------------------------------------------------------
  // Metadata (key-value per asset)
  // -----------------------------------------------------------------------

  setMeta(assetId: string, key: string, value: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO asset_metadata (asset_id, key, value) VALUES (?, ?, ?)')
      .run(assetId, key, value);
  }

  getMeta(assetId: string, key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM asset_metadata WHERE asset_id = ? AND key = ?')
      .get(assetId, key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  updateMeta(assetId: string, key: string, value: string): void {
    this.setMeta(assetId, key, value);
  }

  // -----------------------------------------------------------------------
  // AI Protected Zones
  // -----------------------------------------------------------------------

  addProtectedZone(data: { path: string; name: string; type: string; protectionLevel: string }): AIProtectedZone {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO ai_protected_zones (id, path, name, type, protection_level, created_at, enabled, violation_count)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0)
    `).run(id, data.path, data.name, data.type, data.protectionLevel, now);
    return this.getProtectedZone(id)!;
  }

  removeProtectedZone(zoneId: string): void {
    this.db.prepare('DELETE FROM ai_protected_zones WHERE id = ?').run(zoneId);
  }

  getProtectedZone(zoneId: string): AIProtectedZone | null {
    const row = this.db.prepare('SELECT * FROM ai_protected_zones WHERE id = ?').get(zoneId) as Record<string, unknown> | undefined;
    return row ? rowToZone(row) : null;
  }

  listProtectedZones(): AIProtectedZone[] {
    const rows = this.db.prepare('SELECT * FROM ai_protected_zones ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(rowToZone);
  }

  getProtectedZoneByPath(filePath: string): AIProtectedZone | null {
    const zones = this.listProtectedZones().filter(z => z.enabled);
    for (const zone of zones) {
      if (zone.type === 'file' && filePath === zone.path) return zone;
      if (zone.type === 'directory' && (filePath.startsWith(zone.path + '/') || filePath === zone.path)) return zone;
    }
    return null;
  }

  recordZoneViolation(zoneId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE ai_protected_zones
      SET violation_count = violation_count + 1, last_violation = ?
      WHERE id = ?
    `).run(now, zoneId);
  }

  updateZoneProtectionLevel(zoneId: string, level: string): void {
    this.db.prepare('UPDATE ai_protected_zones SET protection_level = ? WHERE id = ?').run(level, zoneId);
  }

  toggleZone(zoneId: string, enabled: boolean): void {
    this.db.prepare('UPDATE ai_protected_zones SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, zoneId);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  close(): void {
    log.info('[AssetStore] Closing database');
    this.db.close();
  }
}
