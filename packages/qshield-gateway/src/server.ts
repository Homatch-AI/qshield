import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { createHash } from 'node:crypto';

import { GatewayDatabase } from './services/database.js';
import { AuthService } from './services/auth.js';
import { EvidenceVerifier } from './services/evidence-verifier.js';
import { SignalHub } from './ws/signal-hub.js';

import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { trustRoutes } from './routes/trust.js';
import { evidenceRoutes } from './routes/evidence.js';
import { verificationRoutes } from './routes/verification.js';
import { certificateRoutes } from './routes/certificates.js';
import { policyRoutes } from './routes/policy.js';
import { verifyPublicRoutes } from './routes/verify-public.js';
import { createAuthMiddleware } from './middleware/auth.js';

// ── Fastify type augmentation ────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
  }
}

// ── Server ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3847', 10);
const HOST = process.env.HOST || '0.0.0.0';

export async function buildApp(opts?: { dbPath?: string }) {
  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(jwt, {
    secret: process.env.QSHIELD_JWT_SECRET || 'qshield-dev-jwt-secret',
    sign: { expiresIn: '15m' },
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(websocket);

  // Services
  const db = new GatewayDatabase(opts?.dbPath);
  const authService = new AuthService();
  const verifier = new EvidenceVerifier();
  const signalHub = new SignalHub();

  // Decorate request with userId
  app.decorateRequest('userId', '');

  // Auth middleware — available as app.authenticate
  const requireAuth = createAuthMiddleware(db);
  app.decorate('authenticate', requireAuth);

  // ── Routes ─────────────────────────────────────────────────────────────

  // Public routes (no auth)
  await healthRoutes(app);
  await authRoutes(app, db, authService, requireAuth);
  await verifyPublicRoutes(app, db);
  await verificationRoutes(app, db);

  // Authenticated routes — registered as plugins for hook encapsulation
  app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth);
    await trustRoutes(scope, db, signalHub);
    await evidenceRoutes(scope, db, verifier);
    await certificateRoutes(scope, db, verifier);
    await policyRoutes(scope, db);
  });

  // ── WebSocket ──────────────────────────────────────────────────────────

  app.register(async function wsRoutes(fastify) {
    fastify.get('/ws/events', { websocket: true }, (socket, req) => {
      // Authenticate via query param: ?token=<jwt>
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        socket.close(4001, 'Missing token');
        return;
      }

      try {
        const decoded = app.jwt.verify<{ userId: string }>(token);
        signalHub.handleConnection(socket, decoded.userId);
      } catch {
        socket.close(4001, 'Invalid token');
      }
    });
  });

  // Cleanup hook
  app.addHook('onClose', () => {
    signalHub.stopCleanup();
    db.close();
  });

  return { app, db, signalHub };
}

async function start() {
  const { app, signalHub } = await buildApp();
  await app.listen({ port: PORT, host: HOST });
  console.log(`QShield Gateway running on ${HOST}:${PORT}`);
  signalHub.startCleanup();
}

start().catch(console.error);
