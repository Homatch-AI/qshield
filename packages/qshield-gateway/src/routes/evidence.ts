import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GatewayDatabase } from '../services/database.js';
import type { EvidenceVerifier, EvidenceChainRecord } from '../services/evidence-verifier.js';

interface EvidenceBody {
  id: string;
  hash: string;
  previousHash?: string | null;
  previous_hash?: string | null;
  timestamp: string;
  source: string;
  eventType?: string;
  event_type?: string;
  payload: string | Record<string, unknown>;
  iv?: string;
  auth_tag?: string;
  signature?: string;
}

interface VerifyBody {
  records: EvidenceChainRecord[];
  hmacKey: string;
}

export async function evidenceRoutes(app: FastifyInstance, db: GatewayDatabase, verifier: EvidenceVerifier): Promise<void> {
  // POST /api/v1/evidence — submit evidence record(s)
  app.post('/api/v1/evidence', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Body: EvidenceBody | EvidenceBody[] }>, reply: FastifyReply) => {
    const records = Array.isArray(request.body) ? request.body : [request.body];
    let inserted = 0;

    for (const r of records) {
      if (!r.id || !r.hash || !r.timestamp || !r.source) continue;

      // Check for duplicate
      const existing = db.getEvidence(r.id);
      if (existing) continue;

      db.insertEvidence(request.userId, {
        id: r.id,
        hash: r.hash,
        previous_hash: r.previousHash ?? r.previous_hash ?? null,
        timestamp: r.timestamp,
        source: r.source,
        event_type: r.eventType ?? r.event_type ?? 'unknown',
        payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload),
        iv: r.iv ?? null,
        auth_tag: r.auth_tag ?? null,
        signature: r.signature ?? null,
      });
      inserted++;
    }

    return { success: true, inserted, total: records.length };
  });

  // GET /api/v1/evidence/:id
  app.get('/api/v1/evidence/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const record = db.getEvidence(request.params.id);
    if (!record) return reply.code(404).send({ error: 'Evidence record not found', code: 'NOT_FOUND' });
    if (record.user_id !== request.userId) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    return record;
  });

  // GET /api/v1/evidence/chain
  app.get('/api/v1/evidence/chain', async (request: FastifyRequest) => {
    const chain = db.getEvidenceChain(request.userId);
    return { records: chain, count: chain.length };
  });

  // POST /api/v1/evidence/verify — server-side chain verification
  app.post('/api/v1/evidence/verify', async (request: FastifyRequest<{ Body: VerifyBody }>, reply: FastifyReply) => {
    const { records, hmacKey } = request.body || {};
    if (!records || !hmacKey) {
      return reply.code(400).send({ error: 'records and hmacKey are required', code: 'INVALID_REQUEST' });
    }

    const result = verifier.verifyChain(records, hmacKey);

    // Mark verified records in DB
    if (result.valid) {
      for (const r of records) {
        db.markEvidenceVerified(r.id);
      }
    }

    return result;
  });
}
