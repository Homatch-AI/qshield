import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  api_key_hash: string;
  hashed_password: string | null;
  tier: string;
  created_at: string;
  last_login: string | null;
  active: number;
}

export interface Session {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface StoredTrustSignal {
  id: string;
  user_id: string;
  source: string;
  score: number;
  weight: number;
  timestamp: string;
  metadata: string | null;
  received_at: string;
}

export interface StoredEvidenceRecord {
  id: string;
  user_id: string;
  hash: string;
  previous_hash: string | null;
  timestamp: string;
  source: string;
  event_type: string;
  payload: string;
  iv: string | null;
  auth_tag: string | null;
  verified: number;
  signature: string | null;
  received_at: string;
}

export interface StoredVerification {
  id: string;
  user_id: string;
  sender_name: string;
  sender_email: string;
  trust_score: number;
  trust_level: string;
  email_subject_hash: string | null;
  evidence_chain_hash: string;
  evidence_count: number;
  referral_id: string | null;
  click_count: number;
  created_at: string;
}

export interface StoredCertificate {
  id: string;
  user_id: string;
  session_id: string;
  trust_score: number;
  trust_level: string;
  evidence_count: number;
  evidence_hashes: string;
  signature_chain: string;
  generated_at: string;
}

export interface StoredPolicy {
  user_id: string;
  config: string;
  updated_at: string;
}

export interface VerificationStats {
  total: number;
  totalClicks: number;
  clickThroughRate: number;
}

// ── Database ─────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  api_key_hash TEXT UNIQUE NOT NULL,
  hashed_password TEXT,
  tier TEXT NOT NULL DEFAULT 'personal',
  created_at TEXT NOT NULL,
  last_login TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trust_signals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  score REAL NOT NULL,
  weight REAL NOT NULL,
  timestamp TEXT NOT NULL,
  metadata TEXT,
  received_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_signals_user ON trust_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON trust_signals(timestamp);
CREATE INDEX IF NOT EXISTS idx_signals_source ON trust_signals(source);

CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  previous_hash TEXT,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  iv TEXT,
  auth_tag TEXT,
  verified INTEGER DEFAULT 0,
  signature TEXT,
  received_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_evidence_user ON evidence_records(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence_records(hash);
CREATE INDEX IF NOT EXISTS idx_evidence_timestamp ON evidence_records(timestamp);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  trust_score REAL NOT NULL,
  trust_level TEXT NOT NULL,
  email_subject_hash TEXT,
  evidence_chain_hash TEXT NOT NULL,
  evidence_count INTEGER DEFAULT 0,
  referral_id TEXT,
  click_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verifications_user ON verifications(user_id);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  trust_score REAL NOT NULL,
  trust_level TEXT NOT NULL,
  evidence_count INTEGER NOT NULL,
  evidence_hashes TEXT NOT NULL,
  signature_chain TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS policies (
  user_id TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export class GatewayDatabase {
  public db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath || process.env.DATABASE_PATH || './data/qshield-gateway.db';
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // ── Users ────────────────────────────────────────────────────────────────

  createUser(id: string, email: string, name: string | null, apiKeyHash: string, tier = 'personal'): User {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO users (id, email, name, api_key_hash, tier, created_at, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run(id, email, name, apiKeyHash, tier, now);
    return this.getUserById(id)!;
  }

  getUserByEmail(email: string): User | null {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined ?? null;
  }

  getUserByApiKeyHash(apiKeyHash: string): User | null {
    return this.db.prepare('SELECT * FROM users WHERE api_key_hash = ? AND active = 1').get(apiKeyHash) as User | undefined ?? null;
  }

  getUserById(id: string): User | null {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined ?? null;
  }

  updateLastLogin(userId: string): void {
    this.db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), userId);
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  createSession(id: string, userId: string, refreshTokenHash: string, expiresAt: string): Session {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, userId, refreshTokenHash, expiresAt, now);
    return { id, user_id: userId, refresh_token_hash: refreshTokenHash, expires_at: expiresAt, created_at: now };
  }

  getSession(id: string): Session | null {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined ?? null;
  }

  getSessionByRefreshHash(refreshTokenHash: string): Session | null {
    return this.db.prepare(
      'SELECT * FROM sessions WHERE refresh_token_hash = ? AND expires_at > ?',
    ).get(refreshTokenHash, new Date().toISOString()) as Session | undefined ?? null;
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  deleteExpiredSessions(): number {
    const result = this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
    return result.changes;
  }

  deleteUserSessions(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  // ── Trust Signals ────────────────────────────────────────────────────────

  insertSignal(userId: string, signal: { source: string; score: number; weight: number; timestamp: string; metadata?: Record<string, unknown> }): void {
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO trust_signals (id, user_id, source, score, weight, timestamp, metadata, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, signal.source, signal.score, signal.weight, signal.timestamp, signal.metadata ? JSON.stringify(signal.metadata) : null, new Date().toISOString());
  }

  getLatestSignals(userId: string, limit = 50): StoredTrustSignal[] {
    return this.db.prepare(
      'SELECT * FROM trust_signals WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
    ).all(userId, limit) as StoredTrustSignal[];
  }

  getSignalsByTimeRange(userId: string, from: string, to: string): StoredTrustSignal[] {
    return this.db.prepare(
      'SELECT * FROM trust_signals WHERE user_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC',
    ).all(userId, from, to) as StoredTrustSignal[];
  }

  // ── Evidence ─────────────────────────────────────────────────────────────

  insertEvidence(userId: string, record: {
    id: string; hash: string; previous_hash?: string | null; timestamp: string;
    source: string; event_type: string; payload: string;
    iv?: string | null; auth_tag?: string | null; signature?: string | null;
  }): void {
    this.db.prepare(
      `INSERT INTO evidence_records (id, user_id, hash, previous_hash, timestamp, source, event_type, payload, iv, auth_tag, verified, signature, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(
      record.id, userId, record.hash, record.previous_hash ?? null, record.timestamp,
      record.source, record.event_type, record.payload,
      record.iv ?? null, record.auth_tag ?? null, record.signature ?? null, new Date().toISOString(),
    );
  }

  getEvidence(id: string): StoredEvidenceRecord | null {
    return this.db.prepare('SELECT * FROM evidence_records WHERE id = ?').get(id) as StoredEvidenceRecord | undefined ?? null;
  }

  getEvidenceChain(userId: string, limit = 200): StoredEvidenceRecord[] {
    return this.db.prepare(
      'SELECT * FROM evidence_records WHERE user_id = ? ORDER BY timestamp ASC LIMIT ?',
    ).all(userId, limit) as StoredEvidenceRecord[];
  }

  getEvidenceByHash(hash: string): StoredEvidenceRecord | null {
    return this.db.prepare('SELECT * FROM evidence_records WHERE hash = ?').get(hash) as StoredEvidenceRecord | undefined ?? null;
  }

  markEvidenceVerified(id: string): void {
    this.db.prepare('UPDATE evidence_records SET verified = 1 WHERE id = ?').run(id);
  }

  // ── Verifications ────────────────────────────────────────────────────────

  insertVerification(data: {
    id: string; user_id: string; sender_name: string; sender_email: string;
    trust_score: number; trust_level: string; email_subject_hash?: string | null;
    evidence_chain_hash: string; evidence_count?: number; referral_id?: string | null;
  }): void {
    this.db.prepare(
      `INSERT INTO verifications (id, user_id, sender_name, sender_email, trust_score, trust_level, email_subject_hash, evidence_chain_hash, evidence_count, referral_id, click_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      data.id, data.user_id, data.sender_name, data.sender_email,
      data.trust_score, data.trust_level, data.email_subject_hash ?? null,
      data.evidence_chain_hash, data.evidence_count ?? 0, data.referral_id ?? null,
      new Date().toISOString(),
    );
  }

  getVerification(verificationId: string): StoredVerification | null {
    return this.db.prepare('SELECT * FROM verifications WHERE id = ?').get(verificationId) as StoredVerification | undefined ?? null;
  }

  incrementClickCount(verificationId: string): void {
    this.db.prepare('UPDATE verifications SET click_count = click_count + 1 WHERE id = ?').run(verificationId);
  }

  getVerificationStats(userId: string): VerificationStats {
    const row = this.db.prepare(
      'SELECT COUNT(*) as total, COALESCE(SUM(click_count), 0) as totalClicks FROM verifications WHERE user_id = ?',
    ).get(userId) as { total: number; totalClicks: number };
    return {
      total: row.total,
      totalClicks: row.totalClicks,
      clickThroughRate: row.total > 0 ? row.totalClicks / row.total : 0,
    };
  }

  // ── Certificates ─────────────────────────────────────────────────────────

  insertCertificate(data: {
    id: string; user_id: string; session_id: string; trust_score: number;
    trust_level: string; evidence_count: number; evidence_hashes: string[];
    signature_chain: string;
  }): void {
    this.db.prepare(
      `INSERT INTO certificates (id, user_id, session_id, trust_score, trust_level, evidence_count, evidence_hashes, signature_chain, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      data.id, data.user_id, data.session_id, data.trust_score,
      data.trust_level, data.evidence_count, JSON.stringify(data.evidence_hashes),
      data.signature_chain, new Date().toISOString(),
    );
  }

  getCertificate(certId: string): StoredCertificate | null {
    return this.db.prepare('SELECT * FROM certificates WHERE id = ?').get(certId) as StoredCertificate | undefined ?? null;
  }

  getCertificateBySignatureChain(signatureChain: string): StoredCertificate | null {
    return this.db.prepare('SELECT * FROM certificates WHERE signature_chain = ?').get(signatureChain) as StoredCertificate | undefined ?? null;
  }

  listCertificates(userId: string): StoredCertificate[] {
    return this.db.prepare('SELECT * FROM certificates WHERE user_id = ? ORDER BY generated_at DESC').all(userId) as StoredCertificate[];
  }

  // ── Policies ─────────────────────────────────────────────────────────────

  getPolicy(userId: string): StoredPolicy | null {
    return this.db.prepare('SELECT * FROM policies WHERE user_id = ?').get(userId) as StoredPolicy | undefined ?? null;
  }

  upsertPolicy(userId: string, config: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO policies (user_id, config, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`,
    ).run(userId, config, now);
  }
}
