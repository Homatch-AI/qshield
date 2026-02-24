import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GatewayDatabase } from '../services/database.js';
import type { SignalHub } from '../ws/signal-hub.js';

interface SignalBody {
  source: string;
  score: number;
  weight: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface HistoryQuery { from?: string; to?: string }

export async function trustRoutes(app: FastifyInstance, db: GatewayDatabase, signalHub: SignalHub): Promise<void> {
  // GET /api/v1/trust/state
  app.get('/api/v1/trust/state', async (request: FastifyRequest) => {
    const signals = db.getLatestSignals(request.userId, 20);
    if (signals.length === 0) {
      return {
        score: 100, level: 'verified', signals: [],
        lastUpdated: new Date().toISOString(), sessionId: '',
      };
    }

    // Compute simple weighted average from latest signals
    let totalWeight = 0;
    let weightedSum = 0;
    for (const s of signals) {
      weightedSum += s.score * s.weight;
      totalWeight += s.weight;
    }
    const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;
    const level = score >= 90 ? 'verified' : score >= 70 ? 'normal' : score >= 50 ? 'elevated' : score >= 30 ? 'warning' : 'critical';

    return {
      score, level,
      signals: signals.map(s => ({
        source: s.source, score: s.score, weight: s.weight,
        timestamp: s.timestamp, metadata: s.metadata ? JSON.parse(s.metadata) : {},
      })),
      lastUpdated: signals[0]?.timestamp ?? new Date().toISOString(),
      sessionId: '',
    };
  });

  // POST /api/v1/trust/signals
  app.post('/api/v1/trust/signals', async (request: FastifyRequest<{ Body: SignalBody }>, reply: FastifyReply) => {
    const body = request.body;
    if (!body?.source || body.score === undefined) {
      return reply.code(400).send({ error: 'source and score are required', code: 'INVALID_SIGNAL' });
    }

    db.insertSignal(request.userId, {
      source: body.source,
      score: body.score,
      weight: body.weight ?? 1,
      timestamp: body.timestamp ?? new Date().toISOString(),
      metadata: body.metadata,
    });

    // Broadcast to connected WebSocket clients
    signalHub.broadcast(request.userId, {
      source: body.source, score: body.score, weight: body.weight ?? 1,
      timestamp: body.timestamp ?? new Date().toISOString(),
      metadata: body.metadata ?? {},
    });

    return { success: true };
  });

  // GET /api/v1/trust/signals/latest — REST polling fallback
  app.get('/api/v1/trust/signals/latest', async (request: FastifyRequest) => {
    const signals = db.getLatestSignals(request.userId, 10);
    return signals.map(s => ({
      source: s.source, score: s.score, weight: s.weight,
      timestamp: s.timestamp, metadata: s.metadata ? JSON.parse(s.metadata) : {},
    }));
  });

  // GET /api/v1/trust/history
  app.get('/api/v1/trust/history', async (request: FastifyRequest<{ Querystring: HistoryQuery }>) => {
    const { from, to } = request.query;
    const now = new Date().toISOString();
    const signals = db.getSignalsByTimeRange(
      request.userId,
      from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      to || now,
    );
    return signals.map(s => ({
      source: s.source, score: s.score, weight: s.weight,
      timestamp: s.timestamp, metadata: s.metadata ? JSON.parse(s.metadata) : {},
    }));
  });
}
