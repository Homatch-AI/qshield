import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import type { GatewayDatabase } from '../services/database.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export function createAuthMiddleware(db: GatewayDatabase) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers['authorization'];
    const apiKey = request.headers['x-api-key'] as string | undefined;

    // Strategy 1: Bearer JWT
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = await request.jwtVerify<{ userId: string; email: string; tier: string }>();
        request.userId = decoded.userId;
        return;
      } catch {
        return reply.code(401).send({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      }
    }

    // Strategy 2: API Key
    if (apiKey) {
      const hash = createHash('sha256').update(apiKey).digest('hex');
      const user = db.getUserByApiKeyHash(hash);
      if (user && user.active) {
        request.userId = user.id;
        return;
      }
      return reply.code(401).send({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
    }

    return reply.code(401).send({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  };
}
