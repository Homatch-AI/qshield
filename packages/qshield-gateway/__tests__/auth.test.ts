import { describe, it, expect } from 'vitest';
import { AuthService } from '../src/services/auth.js';

describe('AuthService', () => {
  const auth = new AuthService();

  it('generates API key with qsk_live_ prefix', () => {
    const { apiKey } = auth.generateApiKey();
    expect(apiKey).toMatch(/^qsk_live_[0-9a-f]{48}$/);
  });

  it('generates unique API keys', () => {
    const a = auth.generateApiKey();
    const b = auth.generateApiKey();
    expect(a.apiKey).not.toBe(b.apiKey);
    expect(a.apiKeyHash).not.toBe(b.apiKeyHash);
  });

  it('API key hash is 64-char hex (SHA-256)', () => {
    const { apiKeyHash } = auth.generateApiKey();
    expect(apiKeyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashApiKey produces same hash for same key', () => {
    const { apiKey, apiKeyHash } = auth.generateApiKey();
    expect(auth.hashApiKey(apiKey)).toBe(apiKeyHash);
  });

  it('different keys produce different hashes', () => {
    const h1 = auth.hashApiKey('qsk_live_aaa');
    const h2 = auth.hashApiKey('qsk_live_bbb');
    expect(h1).not.toBe(h2);
  });

  it('generates refresh token as 64-char hex', () => {
    const token = auth.generateRefreshToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refresh token hash is deterministic', () => {
    const token = auth.generateRefreshToken();
    const h1 = auth.hashRefreshToken(token);
    const h2 = auth.hashRefreshToken(token);
    expect(h1).toBe(h2);
  });

  it('different refresh tokens have different hashes', () => {
    const t1 = auth.generateRefreshToken();
    const t2 = auth.generateRefreshToken();
    expect(auth.hashRefreshToken(t1)).not.toBe(auth.hashRefreshToken(t2));
  });
});
