import { createHash, randomBytes } from 'node:crypto';

export class AuthService {
  generateApiKey(): { apiKey: string; apiKeyHash: string } {
    const raw = randomBytes(24).toString('hex');
    const apiKey = `qsk_live_${raw}`;
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
    return { apiKey, apiKeyHash };
  }

  hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString('hex');
  }
}
