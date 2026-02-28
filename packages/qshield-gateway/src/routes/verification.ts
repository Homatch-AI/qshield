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
  // POST /api/v1/verification — register a new verification record (public, no auth)
  // Integrity is verified via the HMAC evidenceChainHash field.
  app.post('/api/v1/verification', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Body: VerificationBody }>, reply: FastifyReply) => {
    const body = request.body;
    if (!body?.verificationId || !body.senderEmail || !body.evidenceChainHash) {
      return reply.code(400).send({ error: 'Missing required fields', code: 'INVALID_REQUEST' });
    }

    // Check duplicate
    const existing = db.getVerification(body.verificationId);
    if (existing) return reply.code(409).send({ error: 'Verification already exists', code: 'DUPLICATE' });

    // Derive user_id from email lookup, or use a hash of the sender email
    const user = db.getUserByEmail(body.senderEmail);
    const userId = user?.id ?? `anon:${body.senderEmail}`;

    db.insertVerification({
      id: body.verificationId,
      user_id: userId,
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
}
