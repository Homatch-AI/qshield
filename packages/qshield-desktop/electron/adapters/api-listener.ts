import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface ApiEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const API_EVENTS: ApiEventTemplate[] = [
  {
    eventType: 'api-call',
    trustImpact: 5,
    dataGenerator: () => ({
      method: pickRandom(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
      endpoint: pickRandom([
        '/api/v1/users',
        '/api/v1/trust/state',
        '/api/v1/evidence',
        '/api/v1/alerts',
        '/api/v1/policy',
      ]),
      statusCode: pickRandom([200, 200, 200, 201, 204, 400, 401, 403, 404, 500]),
      responseTime: Math.floor(Math.random() * 2000) + 50,
      clientIp: pickRandom([
        '192.168.1.100',
        '10.0.0.55',
        '172.16.0.12',
        '203.0.113.42',
        '198.51.100.7',
      ]),
      userAgent: pickRandom([
        'QShield Desktop/1.0',
        'Mozilla/5.0',
        'curl/7.88',
        'Python-urllib/3.11',
        'unknown',
      ]),
    }),
  },
  {
    eventType: 'api-auth',
    trustImpact: 10,
    dataGenerator: () => ({
      authType: pickRandom(['bearer-token', 'api-key', 'oauth2', 'mtls', 'basic']),
      userId: `user-${Math.floor(Math.random() * 500)}`,
      success: Math.random() > 0.15,
      mfaUsed: Math.random() > 0.5,
      ipAddress: pickRandom([
        '192.168.1.100',
        '10.0.0.55',
        '172.16.0.12',
        '203.0.113.42',
      ]),
      geoLocation: pickRandom(['US-West', 'US-East', 'EU-West', 'APAC', 'unknown']),
    }),
  },
  {
    eventType: 'api-rate-limit',
    trustImpact: -20,
    dataGenerator: () => ({
      endpoint: pickRandom([
        '/api/v1/auth/login',
        '/api/v1/users/search',
        '/api/v1/export',
        '/api/v1/bulk-update',
      ]),
      clientIp: pickRandom(['203.0.113.42', '198.51.100.7', '192.0.2.100']),
      requestCount: Math.floor(Math.random() * 500) + 100,
      windowSeconds: 60,
      limitPerWindow: 100,
      blocked: Math.random() > 0.3,
    }),
  },
  {
    eventType: 'api-error',
    trustImpact: -15,
    dataGenerator: () => ({
      endpoint: pickRandom([
        '/api/v1/trust/state',
        '/api/v1/evidence',
        '/api/v1/policy/evaluate',
        '/api/v1/certificates/generate',
      ]),
      statusCode: pickRandom([400, 401, 403, 404, 422, 500, 502, 503]),
      errorCode: pickRandom([
        'INVALID_REQUEST',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'NOT_FOUND',
        'INTERNAL_ERROR',
        'SERVICE_UNAVAILABLE',
      ]),
      message: pickRandom([
        'Invalid trust signal payload',
        'Token expired',
        'Insufficient permissions',
        'Resource not found',
        'Database connection timeout',
      ]),
      retryable: Math.random() > 0.4,
    }),
  },
  {
    eventType: 'api-token-refresh',
    trustImpact: 5,
    dataGenerator: () => ({
      tokenType: pickRandom(['access', 'refresh', 'api-key']),
      userId: `user-${Math.floor(Math.random() * 500)}`,
      previousExpiry: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      newExpiry: new Date(Date.now() + Math.random() * 86400000).toISOString(),
      rotationPolicy: pickRandom(['automatic', 'manual', 'forced']),
      success: Math.random() > 0.05,
    }),
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * API Listener adapter.
 * Monitors API activity including requests, authentication events,
 * rate limiting, errors, and token lifecycle management.
 */
export class ApiListenerAdapter extends BaseAdapter {
  readonly id: AdapterType = 'api';
  readonly name = 'API Listener';

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[ApiListenerAdapter] Configured for API monitoring');
  }

  async start(): Promise<void> {
    await super.start();
    log.info('[ApiListenerAdapter] Monitoring API activity');
  }

  async stop(): Promise<void> {
    await super.stop();
    log.info('[ApiListenerAdapter] Stopped API monitoring');
  }

  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[ApiListenerAdapter] API listener adapter destroyed');
  }

  protected generateSimulatedEvent(): AdapterEvent {
    const template = pickRandom(API_EVENTS);
    return {
      adapterId: this.id,
      eventType: template.eventType,
      timestamp: new Date().toISOString(),
      data: template.dataGenerator(),
      trustImpact: template.trustImpact,
    };
  }
}
