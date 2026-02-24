import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GatewayDatabase } from '../services/database.js';

export async function policyRoutes(app: FastifyInstance, db: GatewayDatabase): Promise<void> {
  // GET /api/v1/policy
  app.get('/api/v1/policy', async (request: FastifyRequest) => {
    const policy = db.getPolicy(request.userId);
    if (!policy) return { config: null };
    return { config: JSON.parse(policy.config) };
  });

  // PUT /api/v1/policy
  app.put('/api/v1/policy', async (request: FastifyRequest<{ Body: { config: Record<string, unknown> } }>, reply: FastifyReply) => {
    const { config } = request.body || {};
    if (!config) return reply.code(400).send({ error: 'config is required', code: 'INVALID_REQUEST' });
    db.upsertPolicy(request.userId, JSON.stringify(config));
    return { success: true };
  });
}
