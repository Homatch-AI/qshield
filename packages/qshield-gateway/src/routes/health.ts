import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', async () => {
    return { status: 'ok', version: '1.2.0', uptime: process.uptime() };
  });
}
