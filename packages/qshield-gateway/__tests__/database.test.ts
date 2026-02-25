import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GatewayDatabase } from '../src/services/database.js';
import { randomUUID } from 'node:crypto';

let db: GatewayDatabase;

beforeEach(() => {
  db = new GatewayDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

// ── Users ────────────────────────────────────────────────────────────────────

describe('Database - Users', () => {
  it('creates a user and retrieves by email', () => {
    const id = randomUUID();
    db.createUser(id, 'test@qshield.app', 'Test User', 'hash123');
    const user = db.getUserByEmail('test@qshield.app');
    expect(user).not.toBeNull();
    expect(user!.email).toBe('test@qshield.app');
    expect(user!.name).toBe('Test User');
    expect(user!.tier).toBe('personal');
    expect(user!.active).toBe(1);
  });

  it('retrieves user by API key hash', () => {
    const id = randomUUID();
    db.createUser(id, 'key@qshield.app', null, 'api-hash-001');
    const user = db.getUserByApiKeyHash('api-hash-001');
    expect(user).not.toBeNull();
    expect(user!.id).toBe(id);
  });

  it('returns null for non-existent email', () => {
    expect(db.getUserByEmail('nobody@qshield.app')).toBeNull();
  });

  it('returns null for non-existent API key', () => {
    expect(db.getUserByApiKeyHash('nonexistent')).toBeNull();
  });

  it('retrieves user by ID', () => {
    const id = randomUUID();
    db.createUser(id, 'byid@qshield.app', 'By ID', 'hash-byid');
    expect(db.getUserById(id)!.email).toBe('byid@qshield.app');
  });

  it('updates last login', () => {
    const id = randomUUID();
    db.createUser(id, 'login@qshield.app', null, 'hash-login');
    expect(db.getUserById(id)!.last_login).toBeNull();
    db.updateLastLogin(id);
    expect(db.getUserById(id)!.last_login).not.toBeNull();
  });

  it('rejects duplicate email', () => {
    const id1 = randomUUID();
    const id2 = randomUUID();
    db.createUser(id1, 'dup@qshield.app', null, 'hash-a');
    expect(() => db.createUser(id2, 'dup@qshield.app', null, 'hash-b')).toThrow();
  });
});

// ── Sessions ─────────────────────────────────────────────────────────────────

describe('Database - Sessions', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.createUser(userId, `sess-${userId.slice(0, 6)}@q.io`, null, `hash-${userId.slice(0, 6)}`);
  });

  it('creates and retrieves a session', () => {
    const sid = randomUUID();
    const expires = new Date(Date.now() + 86400000).toISOString();
    db.createSession(sid, userId, 'refresh-hash', expires);
    const session = db.getSession(sid);
    expect(session).not.toBeNull();
    expect(session!.user_id).toBe(userId);
  });

  it('finds session by refresh token hash', () => {
    const sid = randomUUID();
    const expires = new Date(Date.now() + 86400000).toISOString();
    db.createSession(sid, userId, 'lookup-hash', expires);
    const session = db.getSessionByRefreshHash('lookup-hash');
    expect(session).not.toBeNull();
    expect(session!.id).toBe(sid);
  });

  it('expired session not returned by refresh lookup', () => {
    const sid = randomUUID();
    const expired = new Date(Date.now() - 1000).toISOString();
    db.createSession(sid, userId, 'expired-hash', expired);
    expect(db.getSessionByRefreshHash('expired-hash')).toBeNull();
  });

  it('deletes a session', () => {
    const sid = randomUUID();
    db.createSession(sid, userId, 'del-hash', new Date(Date.now() + 86400000).toISOString());
    db.deleteSession(sid);
    expect(db.getSession(sid)).toBeNull();
  });

  it('deletes expired sessions', () => {
    const sid1 = randomUUID();
    const sid2 = randomUUID();
    db.createSession(sid1, userId, 'h1', new Date(Date.now() - 1000).toISOString());
    db.createSession(sid2, userId, 'h2', new Date(Date.now() + 86400000).toISOString());
    const deleted = db.deleteExpiredSessions();
    expect(deleted).toBe(1);
    expect(db.getSession(sid2)).not.toBeNull();
  });

  it('deletes all user sessions', () => {
    db.createSession(randomUUID(), userId, 'ha', new Date(Date.now() + 86400000).toISOString());
    db.createSession(randomUUID(), userId, 'hb', new Date(Date.now() + 86400000).toISOString());
    db.deleteUserSessions(userId);
    // No sessions should remain for this user (verify via refresh hash lookup returns null)
    expect(db.getSessionByRefreshHash('ha')).toBeNull();
    expect(db.getSessionByRefreshHash('hb')).toBeNull();
  });
});

// ── Trust Signals ────────────────────────────────────────────────────────────

describe('Database - Trust Signals', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.createUser(userId, `sig-${userId.slice(0, 6)}@q.io`, null, `hash-sig-${userId.slice(0, 6)}`);
  });

  it('inserts and retrieves signals', () => {
    db.insertSignal(userId, { source: 'zoom', score: 85, weight: 1, timestamp: '2024-01-01T00:00:00Z' });
    db.insertSignal(userId, { source: 'teams', score: 90, weight: 1, timestamp: '2024-01-01T00:01:00Z' });
    const signals = db.getLatestSignals(userId);
    expect(signals).toHaveLength(2);
  });

  it('latest signals are ordered by timestamp DESC', () => {
    db.insertSignal(userId, { source: 'email', score: 70, weight: 1, timestamp: '2024-01-01T00:00:00Z' });
    db.insertSignal(userId, { source: 'file', score: 95, weight: 1, timestamp: '2024-01-01T01:00:00Z' });
    const signals = db.getLatestSignals(userId, 10);
    expect(signals[0].source).toBe('file'); // most recent first
  });

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      db.insertSignal(userId, { source: 'zoom', score: 80 + i, weight: 1, timestamp: `2024-01-01T0${i}:00:00Z` });
    }
    expect(db.getLatestSignals(userId, 3)).toHaveLength(3);
  });

  it('time range query works', () => {
    db.insertSignal(userId, { source: 'zoom', score: 80, weight: 1, timestamp: '2024-01-01T00:00:00Z' });
    db.insertSignal(userId, { source: 'zoom', score: 85, weight: 1, timestamp: '2024-01-01T12:00:00Z' });
    db.insertSignal(userId, { source: 'zoom', score: 90, weight: 1, timestamp: '2024-01-02T00:00:00Z' });
    const signals = db.getSignalsByTimeRange(userId, '2024-01-01T06:00:00Z', '2024-01-01T18:00:00Z');
    expect(signals).toHaveLength(1);
    expect(signals[0].score).toBe(85);
  });

  it('stores metadata as JSON', () => {
    db.insertSignal(userId, { source: 'api', score: 75, weight: 1, timestamp: '2024-01-01T00:00:00Z', metadata: { key: 'value' } });
    const signals = db.getLatestSignals(userId, 1);
    expect(JSON.parse(signals[0].metadata!)).toEqual({ key: 'value' });
  });
});

// ── Evidence ─────────────────────────────────────────────────────────────────

describe('Database - Evidence', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.createUser(userId, `ev-${userId.slice(0, 6)}@q.io`, null, `hash-ev-${userId.slice(0, 6)}`);
  });

  it('inserts and retrieves evidence by ID', () => {
    const id = randomUUID();
    db.insertEvidence(userId, { id, hash: 'abc123', timestamp: '2024-01-01T00:00:00Z', source: 'zoom', event_type: 'meeting-started', payload: '{}' });
    const record = db.getEvidence(id);
    expect(record).not.toBeNull();
    expect(record!.hash).toBe('abc123');
    expect(record!.verified).toBe(0);
  });

  it('retrieves evidence by hash', () => {
    const id = randomUUID();
    db.insertEvidence(userId, { id, hash: 'unique-hash-xyz', timestamp: '2024-01-01T00:00:00Z', source: 'email', event_type: 'send', payload: '{}' });
    expect(db.getEvidenceByHash('unique-hash-xyz')!.id).toBe(id);
  });

  it('retrieves evidence chain ordered by timestamp', () => {
    db.insertEvidence(userId, { id: randomUUID(), hash: 'h1', timestamp: '2024-01-01T00:00:00Z', source: 'zoom', event_type: 'e1', payload: '{}' });
    db.insertEvidence(userId, { id: randomUUID(), hash: 'h2', timestamp: '2024-01-01T01:00:00Z', source: 'zoom', event_type: 'e2', payload: '{}' });
    db.insertEvidence(userId, { id: randomUUID(), hash: 'h3', timestamp: '2024-01-01T02:00:00Z', source: 'zoom', event_type: 'e3', payload: '{}' });
    const chain = db.getEvidenceChain(userId);
    expect(chain).toHaveLength(3);
    expect(chain[0].hash).toBe('h1');
    expect(chain[2].hash).toBe('h3');
  });

  it('marks evidence as verified', () => {
    const id = randomUUID();
    db.insertEvidence(userId, { id, hash: 'vh', timestamp: '2024-01-01T00:00:00Z', source: 'file', event_type: 'access', payload: '{}' });
    expect(db.getEvidence(id)!.verified).toBe(0);
    db.markEvidenceVerified(id);
    expect(db.getEvidence(id)!.verified).toBe(1);
  });

  it('stores optional iv, auth_tag, signature', () => {
    const id = randomUUID();
    db.insertEvidence(userId, { id, hash: 'enc', timestamp: '2024-01-01T00:00:00Z', source: 'crypto', event_type: 'enc', payload: 'encrypted', iv: 'iv123', auth_tag: 'tag456', signature: 'sig789' });
    const r = db.getEvidence(id)!;
    expect(r.iv).toBe('iv123');
    expect(r.auth_tag).toBe('tag456');
    expect(r.signature).toBe('sig789');
  });
});

// ── Verifications ────────────────────────────────────────────────────────────

describe('Database - Verifications', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.createUser(userId, `vf-${userId.slice(0, 6)}@q.io`, null, `hash-vf-${userId.slice(0, 6)}`);
  });

  it('inserts and retrieves verification', () => {
    db.insertVerification({ id: 'v001', user_id: userId, sender_name: 'Alice', sender_email: 'alice@test.io', trust_score: 92, trust_level: 'verified', evidence_chain_hash: 'chain-hash' });
    const v = db.getVerification('v001');
    expect(v).not.toBeNull();
    expect(v!.sender_name).toBe('Alice');
    expect(v!.trust_score).toBe(92);
    expect(v!.click_count).toBe(0);
  });

  it('increments click count', () => {
    db.insertVerification({ id: 'v002', user_id: userId, sender_name: 'Bob', sender_email: 'bob@test.io', trust_score: 85, trust_level: 'normal', evidence_chain_hash: 'ch2' });
    db.incrementClickCount('v002');
    db.incrementClickCount('v002');
    db.incrementClickCount('v002');
    expect(db.getVerification('v002')!.click_count).toBe(3);
  });

  it('returns null for non-existent verification', () => {
    expect(db.getVerification('nonexistent')).toBeNull();
  });

  it('computes verification stats', () => {
    db.insertVerification({ id: 'vs1', user_id: userId, sender_name: 'A', sender_email: 'a@t.io', trust_score: 90, trust_level: 'verified', evidence_chain_hash: 'c1' });
    db.insertVerification({ id: 'vs2', user_id: userId, sender_name: 'B', sender_email: 'b@t.io', trust_score: 80, trust_level: 'normal', evidence_chain_hash: 'c2' });
    db.incrementClickCount('vs1');
    db.incrementClickCount('vs1');
    db.incrementClickCount('vs2');
    const stats = db.getVerificationStats(userId);
    expect(stats.total).toBe(2);
    expect(stats.totalClicks).toBe(3);
    expect(stats.clickThroughRate).toBe(1.5);
  });
});

// ── Certificates ─────────────────────────────────────────────────────────────

describe('Database - Certificates', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.createUser(userId, `cert-${userId.slice(0, 6)}@q.io`, null, `hash-cert-${userId.slice(0, 6)}`);
  });

  it('inserts and retrieves certificate', () => {
    db.insertCertificate({ id: 'cert-001', user_id: userId, session_id: 'sess-1', trust_score: 95, trust_level: 'verified', evidence_count: 10, evidence_hashes: ['h1', 'h2'], signature_chain: 'sig-chain-001' });
    const cert = db.getCertificate('cert-001');
    expect(cert).not.toBeNull();
    expect(cert!.trust_score).toBe(95);
    expect(JSON.parse(cert!.evidence_hashes)).toEqual(['h1', 'h2']);
  });

  it('retrieves certificate by signature chain', () => {
    db.insertCertificate({ id: 'cert-002', user_id: userId, session_id: 'sess-2', trust_score: 88, trust_level: 'normal', evidence_count: 5, evidence_hashes: ['a'], signature_chain: 'unique-sig' });
    expect(db.getCertificateBySignatureChain('unique-sig')!.id).toBe('cert-002');
  });

  it('lists certificates for user', () => {
    db.insertCertificate({ id: 'cert-a', user_id: userId, session_id: 's1', trust_score: 90, trust_level: 'verified', evidence_count: 3, evidence_hashes: [], signature_chain: 'sa' });
    db.insertCertificate({ id: 'cert-b', user_id: userId, session_id: 's2', trust_score: 85, trust_level: 'normal', evidence_count: 2, evidence_hashes: [], signature_chain: 'sb' });
    const list = db.listCertificates(userId);
    expect(list).toHaveLength(2);
  });
});

// ── Policies ─────────────────────────────────────────────────────────────────

describe('Database - Policies', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.createUser(userId, `pol-${userId.slice(0, 6)}@q.io`, null, `hash-pol-${userId.slice(0, 6)}`);
  });

  it('returns null when no policy exists', () => {
    expect(db.getPolicy(userId)).toBeNull();
  });

  it('upserts and retrieves policy', () => {
    db.upsertPolicy(userId, JSON.stringify({ autoFreeze: 20 }));
    const p = db.getPolicy(userId);
    expect(p).not.toBeNull();
    expect(JSON.parse(p!.config)).toEqual({ autoFreeze: 20 });
  });

  it('upsert overwrites existing policy', () => {
    db.upsertPolicy(userId, JSON.stringify({ v: 1 }));
    db.upsertPolicy(userId, JSON.stringify({ v: 2 }));
    expect(JSON.parse(db.getPolicy(userId)!.config)).toEqual({ v: 2 });
  });
});
