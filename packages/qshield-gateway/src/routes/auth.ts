import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { GatewayDatabase } from '../services/database.js';
import type { AuthService } from '../services/auth.js';

interface RegisterBody { email: string; name?: string }
interface LoginBody { apiKey?: string; email?: string; password?: string }
interface RefreshBody { refreshToken: string }

export async function authRoutes(app: FastifyInstance, db: GatewayDatabase, authService: AuthService, requireAuth?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>): Promise<void> {

  // POST /api/v1/auth/register
  app.post('/api/v1/auth/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
    const { email, name } = request.body || {};
    if (!email) return reply.code(400).send({ error: 'Email is required', code: 'MISSING_EMAIL' });

    const existing = db.getUserByEmail(email);
    if (existing) return reply.code(409).send({ error: 'Email already registered', code: 'DUPLICATE_EMAIL' });

    const { apiKey, apiKeyHash } = authService.generateApiKey();
    const userId = randomUUID();
    const user = db.createUser(userId, email, name ?? null, apiKeyHash);

    return reply.code(201).send({
      user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
      apiKey,
    });
  });

  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { apiKey } = request.body || {};
    if (!apiKey) return reply.code(400).send({ error: 'API key is required', code: 'MISSING_CREDENTIALS' });

    const hash = authService.hashApiKey(apiKey);
    const user = db.getUserByApiKeyHash(hash);
    if (!user) return reply.code(401).send({ error: 'Invalid API key', code: 'INVALID_API_KEY' });

    db.updateLastLogin(user.id);

    // Generate tokens
    const accessToken = app.jwt.sign({ userId: user.id, email: user.email, tier: user.tier });
    const refreshToken = authService.generateRefreshToken();
    const refreshTokenHash = authService.hashRefreshToken(refreshToken);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    const sessionId = randomUUID();
    db.createSession(sessionId, user.id, refreshTokenHash, expiresAt);

    return { accessToken, refreshToken, expiresIn: 900 }; // 15 min
  });

  // POST /api/v1/auth/refresh
  app.post('/api/v1/auth/refresh', async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
    const { refreshToken } = request.body || {};
    if (!refreshToken) return reply.code(400).send({ error: 'Refresh token required', code: 'MISSING_TOKEN' });

    const refreshHash = authService.hashRefreshToken(refreshToken);
    const session = db.getSessionByRefreshHash(refreshHash);
    if (!session) return reply.code(401).send({ error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH' });

    const user = db.getUserById(session.user_id);
    if (!user) return reply.code(401).send({ error: 'User not found', code: 'USER_NOT_FOUND' });

    // Rotate: delete old session, create new
    db.deleteSession(session.id);
    const accessToken = app.jwt.sign({ userId: user.id, email: user.email, tier: user.tier });
    const newRefresh = authService.generateRefreshToken();
    const newRefreshHash = authService.hashRefreshToken(newRefresh);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.createSession(randomUUID(), user.id, newRefreshHash, expiresAt);

    return { accessToken, refreshToken: newRefresh, expiresIn: 900 };
  });

  // POST /api/v1/auth/disconnect
  app.post('/api/v1/auth/disconnect', {
    ...(requireAuth ? { preHandler: [requireAuth] } : {}),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    db.deleteUserSessions(request.userId);
    return { success: true };
  });
}
