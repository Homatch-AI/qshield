import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GatewayDatabase } from '../services/database.js';
import type { EvidenceVerifier } from '../services/evidence-verifier.js';

interface CertificateBody {
  id: string;
  sessionId: string;
  trustScore: number;
  trustLevel: string;
  evidenceCount: number;
  evidenceHashes: string[];
  signatureChain: string;
}

interface VerifyCertBody {
  signatureChain: string;
  evidenceHashes: string[];
  hmacKey: string;
}

export async function certificateRoutes(app: FastifyInstance, db: GatewayDatabase, verifier: EvidenceVerifier): Promise<void> {
  // POST /api/v1/certificates — register a certificate
  // When the desktop registers a certificate, it should include the real
  // evidence hashes from its local evidence store, not fake ones.
  // The gateway then independently verifies the signatureChain matches.
  app.post('/api/v1/certificates', async (request: FastifyRequest<{ Body: CertificateBody }>, reply: FastifyReply) => {
    const body = request.body;
    if (!body?.id || !body.signatureChain || !body.evidenceHashes) {
      return reply.code(400).send({ error: 'Missing required fields', code: 'INVALID_REQUEST' });
    }

    const existing = db.getCertificate(body.id);
    if (existing) return reply.code(409).send({ error: 'Certificate already exists', code: 'DUPLICATE' });

    db.insertCertificate({
      id: body.id,
      user_id: request.userId,
      session_id: body.sessionId,
      trust_score: body.trustScore,
      trust_level: body.trustLevel,
      evidence_count: body.evidenceCount,
      evidence_hashes: body.evidenceHashes,
      signature_chain: body.signatureChain,
    });

    return reply.code(201).send({ success: true, certificateId: body.id });
  });

  // GET /api/v1/certificates/:id
  app.get('/api/v1/certificates/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const cert = db.getCertificate(request.params.id);
    if (!cert) return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });
    if (cert.user_id !== request.userId) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    return cert;
  });

  // POST /api/v1/certificates/verify — verify certificate signature chain
  app.post('/api/v1/certificates/verify', async (request: FastifyRequest<{ Body: VerifyCertBody }>, reply: FastifyReply) => {
    const { signatureChain, evidenceHashes, hmacKey } = request.body || {};
    if (!signatureChain || !evidenceHashes || !hmacKey) {
      return reply.code(400).send({ error: 'Missing required fields', code: 'INVALID_REQUEST' });
    }
    return verifier.verifyCertificate(signatureChain, evidenceHashes, hmacKey);
  });
}
