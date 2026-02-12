import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface ApiEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const ENDPOINTS = [
  '/api/v1/users', '/api/v1/trust/state', '/api/v1/evidence',
  '/api/v1/alerts', '/api/v1/policy', '/api/v1/certificates',
  '/api/v1/sessions', '/api/v1/config', '/api/v1/health',
];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const IP_ADDRESSES = [
  '192.168.1.100', '10.0.0.55', '172.16.0.12',
  '203.0.113.42', '198.51.100.7', '192.0.2.100',
];
const USER_AGENTS = [
  'QShield Desktop/1.0', 'Mozilla/5.0 (Windows NT 10.0)',
  'curl/7.88', 'Python-urllib/3.11', 'PostmanRuntime/7.32',
  'okhttp/4.11', 'axios/1.6',
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const API_EVENTS: ApiEventTemplate[] = [
  {
    eventType: 'api-request',
    trustImpact: 5,
    dataGenerator: () => ({
      method: pickRandom(METHODS),
      endpoint: pickRandom(ENDPOINTS),
      clientIp: pickRandom(IP_ADDRESSES),
      userAgent: pickRandom(USER_AGENTS),
      requestSize: Math.floor(Math.random() * 10000),
      contentType: pickRandom(['application/json', 'multipart/form-data', 'text/plain']),
      traceId: `trace-${Math.floor(Math.random() * 1000000).toString(36)}`,
    }),
  },
  {
    eventType: 'api-response',
    trustImpact: 5,
    dataGenerator: () => ({
      method: pickRandom(METHODS),
      endpoint: pickRandom(ENDPOINTS),
      statusCode: pickRandom([200, 200, 200, 201, 204, 301, 400, 404, 500]),
      responseTime: Math.floor(Math.random() * 2000) + 10,
      responseSize: Math.floor(Math.random() * 50000),
      cached: Math.random() > 0.7,
      traceId: `trace-${Math.floor(Math.random() * 1000000).toString(36)}`,
    }),
  },
  {
    eventType: 'auth-success',
    trustImpact: 10,
    dataGenerator: () => ({
      authType: pickRandom(['bearer-token', 'api-key', 'oauth2', 'mtls']),
      userId: `user-${Math.floor(Math.random() * 500)}`,
      mfaUsed: Math.random() > 0.5,
      ipAddress: pickRandom(IP_ADDRESSES),
      geoLocation: pickRandom(['US-West', 'US-East', 'EU-West', 'APAC']),
      sessionDuration: Math.floor(Math.random() * 28800) + 300,
      scopes: pickRandom([
        ['read', 'write'], ['read'], ['admin', 'read', 'write'], ['read', 'export'],
      ]),
    }),
  },
  {
    eventType: 'auth-failure',
    trustImpact: -20,
    dataGenerator: () => ({
      authType: pickRandom(['bearer-token', 'api-key', 'basic', 'oauth2']),
      attemptedUserId: `user-${Math.floor(Math.random() * 500)}`,
      reason: pickRandom([
        'invalid-credentials', 'expired-token', 'invalid-api-key',
        'mfa-required', 'account-locked', 'ip-blocked',
      ]),
      ipAddress: pickRandom(IP_ADDRESSES),
      geoLocation: pickRandom(['US-West', 'US-East', 'EU-West', 'APAC', 'unknown']),
      consecutiveFailures: Math.floor(Math.random() * 10) + 1,
      userAgent: pickRandom(USER_AGENTS),
    }),
  },
  {
    eventType: 'rate-limit-hit',
    trustImpact: -20,
    dataGenerator: () => ({
      endpoint: pickRandom(ENDPOINTS),
      clientIp: pickRandom(IP_ADDRESSES),
      requestCount: Math.floor(Math.random() * 500) + 100,
      windowSeconds: 60,
      limitPerWindow: 100,
      blocked: Math.random() > 0.3,
      userAgent: pickRandom(USER_AGENTS),
      retryAfter: Math.floor(Math.random() * 60) + 5,
    }),
  },
  {
    eventType: 'unusual-endpoint-access',
    trustImpact: -30,
    dataGenerator: () => ({
      endpoint: pickRandom([
        '/api/v1/admin/users', '/api/v1/debug/dump',
        '/api/internal/config', '/api/v1/export/all',
        '/.env', '/api/v1/admin/reset', '/wp-admin',
      ]),
      method: pickRandom(METHODS),
      clientIp: pickRandom(IP_ADDRESSES),
      userAgent: pickRandom(USER_AGENTS),
      statusCode: pickRandom([200, 403, 404, 405]),
      reason: pickRandom([
        'undocumented-endpoint', 'admin-access-from-external',
        'scanning-pattern-detected', 'unusual-http-method',
        'path-traversal-attempt', 'first-time-access',
      ]),
      riskScore: Math.round((Math.random() * 60 + 40) * 10) / 10, // 40-100
    }),
  },
];

/**
 * API Listener adapter.
 * Monitors API activity including requests, responses, authentication events,
 * rate limiting, and unusual endpoint access patterns.
 * Produces simulated events at a configurable interval (default 12 seconds).
 */
export class ApiListenerAdapter extends BaseAdapter {
  readonly id: AdapterType = 'api';
  readonly name = 'API Listener';
  protected override defaultInterval = 12000;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  /**
   * Initialize the API Listener adapter with optional configuration.
   * @param config - may include pollInterval override
   */
  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[ApiListenerAdapter] Configured for API monitoring');
  }

  /**
   * Start monitoring API activity.
   */
  async start(): Promise<void> {
    await super.start();
    log.info('[ApiListenerAdapter] Monitoring API activity');
  }

  /**
   * Stop monitoring API activity.
   */
  async stop(): Promise<void> {
    await super.stop();
    log.info('[ApiListenerAdapter] Stopped API monitoring');
  }

  /**
   * Destroy the API Listener adapter and release all resources.
   */
  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[ApiListenerAdapter] API listener adapter destroyed');
  }

  /**
   * Generate a simulated API event with realistic metadata including
   * endpoints, HTTP methods, status codes, response times, and IP addresses.
   * @returns an AdapterEvent representing API activity
   */
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
