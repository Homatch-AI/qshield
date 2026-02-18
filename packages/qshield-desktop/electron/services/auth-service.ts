/**
 * Authentication service — handles login, registration, session persistence,
 * and session restoration for offline + online support.
 *
 * Currently uses mock/stub API calls. Structure is ready for real backend integration.
 * TODO: Replace mock implementations with real API calls when backend is ready.
 */
import { randomUUID } from 'node:crypto';
import log from 'electron-log';
import type { ConfigManager } from './config';
import type { QShieldEdition } from '@qshield/core';

// ── Test accounts ─────────────────────────────────────────────────────────────

/** Default password for all test accounts */
const TEST_PASSWORD = 'qshield123';

/** Test accounts — email → edition + display name */
const TEST_ACCOUNTS: Record<string, { edition: QShieldEdition; name: string }> = {
  'free@free.com':         { edition: 'free',       name: 'Free User' },
  'personal@personal.com': { edition: 'personal',   name: 'Personal User' },
  'biz@biz.com':           { edition: 'business',   name: 'Business User' },
  'ent@ent.com':           { edition: 'enterprise',  name: 'Enterprise User' },
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  edition: string; // "personal" | "business" | "enterprise"
  createdAt: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Session duration: 24 hours */
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

// ── AuthService ──────────────────────────────────────────────────────────────

export class AuthService {
  constructor(private config: ConfigManager) {}

  /**
   * Log in with email and password.
   * MOCK: accepts any valid email/password combo, generates a fake session.
   * TODO: POST /api/v1/auth/login
   */
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const { email, password } = credentials;

    // Input validation
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email address');
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // TODO: Replace mock with POST /api/v1/auth/login

    const normalizedEmail = email.toLowerCase();
    const testAccount = TEST_ACCOUNTS[normalizedEmail];

    // Test account password check
    if (testAccount && password !== TEST_PASSWORD) {
      throw new Error('Invalid password for test account');
    }

    // Non-test accounts get enterprise edition so all features are available
    const edition: QShieldEdition = testAccount?.edition ?? 'enterprise';
    const name = testAccount?.name ?? normalizedEmail.split('@')[0];

    const now = Date.now();
    const session: AuthSession = {
      user: {
        id: randomUUID(),
        email: normalizedEmail,
        name,
        edition,
        createdAt: new Date(now).toISOString(),
      },
      accessToken: `mock_access_${randomUUID()}`,
      refreshToken: `mock_refresh_${randomUUID()}`,
      expiresAt: now + SESSION_DURATION_MS,
    };

    this.config.set('auth.session', session);

    log.info(`[AuthService] Login successful: ${normalizedEmail} (${edition})`);
    return session;
  }

  /**
   * Register a new account.
   * MOCK: creates user and returns a session.
   * TODO: POST /api/v1/auth/register
   */
  async register(credentials: RegisterCredentials): Promise<AuthSession> {
    const { email, password, name } = credentials;

    // Input validation
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email address');
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    if (!name || name.trim().length === 0) {
      throw new Error('Name is required');
    }

    // TODO: Replace mock with POST /api/v1/auth/register

    const normalizedEmail = email.toLowerCase();
    const testAccount = TEST_ACCOUNTS[normalizedEmail];

    // Non-test accounts get enterprise edition so all features are available
    const edition: QShieldEdition = testAccount?.edition ?? 'enterprise';
    const displayName = testAccount?.name ?? name.trim();

    const now = Date.now();
    const session: AuthSession = {
      user: {
        id: randomUUID(),
        email: normalizedEmail,
        name: displayName,
        edition,
        createdAt: new Date(now).toISOString(),
      },
      accessToken: `mock_access_${randomUUID()}`,
      refreshToken: `mock_refresh_${randomUUID()}`,
      expiresAt: now + SESSION_DURATION_MS,
    };

    this.config.set('auth.session', session);

    log.info(`[AuthService] Registration successful: ${normalizedEmail} (${edition})`);
    return session;
  }

  /**
   * Log out the current user. Clears session and license.
   */
  async logout(): Promise<void> {
    this.config.set('auth.session', null);
    log.info('[AuthService] Logged out');
  }

  /**
   * Get the current session, or null if no session or expired.
   */
  getSession(): AuthSession | null {
    const raw = this.config.get('auth.session') as AuthSession | null;
    if (!raw) return null;

    // Check expiry
    if (Date.now() > raw.expiresAt) {
      log.info('[AuthService] Session expired');
      return null;
    }

    return raw;
  }

  /**
   * Check whether the user is currently authenticated.
   */
  isAuthenticated(): boolean {
    return this.getSession() !== null;
  }

  /**
   * Get the current user, or null if not authenticated.
   */
  getUser(): AuthUser | null {
    const session = this.getSession();
    return session?.user ?? null;
  }

  /**
   * Refresh the current session, extending its expiry.
   * MOCK: extends expiry by 24 hours.
   * TODO: POST /api/v1/auth/refresh
   * @returns true if session was refreshed successfully
   */
  async refreshSession(): Promise<boolean> {
    const session = this.config.get('auth.session') as AuthSession | null;
    if (!session) return false;

    // TODO: Replace with real API call
    // const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${session.refreshToken}` },
    // });

    const now = Date.now();
    const refreshed: AuthSession = {
      ...session,
      accessToken: `mock_access_${randomUUID()}`,
      expiresAt: now + SESSION_DURATION_MS,
    };

    this.config.set('auth.session', refreshed);
    log.info(`[AuthService] Session refreshed for ${session.user.email}`);
    return true;
  }

  /**
   * Switch the current user's edition (dev/testing only).
   * Updates the persisted session with the new edition.
   */
  async switchEdition(edition: 'free' | 'personal' | 'business' | 'enterprise'): Promise<AuthSession> {
    const session = this.config.get('auth.session') as AuthSession | null;
    if (!session) {
      throw new Error('Not authenticated');
    }
    session.user.edition = edition;
    this.config.set('auth.session', session);
    log.info(`[AuthService] Edition switched to ${edition}`);
    return session;
  }

  /**
   * Restore a cached session on app startup.
   * Reads persisted session, validates expiry, refreshes if needed.
   * @returns true if user is authenticated after restore
   */
  async restoreSession(): Promise<boolean> {
    const raw = this.config.get('auth.session') as AuthSession | null;
    if (!raw) {
      log.info('[AuthService] No cached session to restore');
      return false;
    }

    // If session is still valid, we're good
    if (Date.now() < raw.expiresAt) {
      // Upgrade non-test accounts to enterprise so all features are available
      const testAccount = TEST_ACCOUNTS[raw.user.email.toLowerCase()];
      if (!testAccount && raw.user.edition !== 'enterprise') {
        raw.user.edition = 'enterprise';
        this.config.set('auth.session', raw);
        log.info(`[AuthService] Session restored for ${raw.user.email}, upgraded to enterprise`);
      } else {
        log.info(`[AuthService] Session restored for ${raw.user.email}`);
      }
      return true;
    }

    // Session expired — try to refresh
    log.info('[AuthService] Cached session expired, attempting refresh...');
    const refreshed = await this.refreshSession();
    if (refreshed) {
      log.info('[AuthService] Session refreshed successfully');
      return true;
    }

    // Refresh failed — clear stale session
    this.config.set('auth.session', null);
    log.info('[AuthService] Session refresh failed, cleared stale session');
    return false;
  }
}
