import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GatewayDatabase } from '../services/database.js';

interface VerificationBody {
  verificationId: string;
  senderName: string;
  senderEmail: string;
  trustScore: number;
  trustLevel: string;
  emailSubjectHash?: string;
  evidenceChainHash: string;
  evidenceCount?: number;
  referralId?: string;
}

export async function verificationRoutes(app: FastifyInstance, db: GatewayDatabase): Promise<void> {
  // POST /api/v1/verification — register a new verification record
  app.post('/api/v1/verification', async (request: FastifyRequest<{ Body: VerificationBody }>, reply: FastifyReply) => {
    const body = request.body;
    if (!body?.verificationId || !body.senderEmail || !body.evidenceChainHash) {
      return reply.code(400).send({ error: 'Missing required fields', code: 'INVALID_REQUEST' });
    }

    // Check duplicate
    const existing = db.getVerification(body.verificationId);
    if (existing) return reply.code(409).send({ error: 'Verification already exists', code: 'DUPLICATE' });

    db.insertVerification({
      id: body.verificationId,
      user_id: request.userId,
      sender_name: body.senderName,
      sender_email: body.senderEmail,
      trust_score: body.trustScore,
      trust_level: body.trustLevel,
      email_subject_hash: body.emailSubjectHash ?? null,
      evidence_chain_hash: body.evidenceChainHash,
      evidence_count: body.evidenceCount ?? 0,
      referral_id: body.referralId ?? null,
    });

    return reply.code(201).send({ success: true, verificationId: body.verificationId });
  });

  // GET /api/v1/verification/:id — authenticated detail
  app.get('/api/v1/verification/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const record = db.getVerification(request.params.id);
    if (!record) return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });
    if (record.user_id !== request.userId) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    return record;
  });

  // GET /api/v1/verification/stats
  app.get('/api/v1/verification/stats', async (request: FastifyRequest) => {
    return db.getVerificationStats(request.userId);
  });
}
