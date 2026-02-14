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

    // TODO: Replace with real API call
    // const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, password }),
    // });

    const now = Date.now();
    const session: AuthSession = {
      user: {
        id: randomUUID(),
        email,
        name: email.split('@')[0],
        edition: 'personal',
        createdAt: new Date(now).toISOString(),
      },
      accessToken: `mock_access_${randomUUID()}`,
      refreshToken: `mock_refresh_${randomUUID()}`,
      expiresAt: now + SESSION_DURATION_MS,
    };

    // Persist session to config
    // TODO: Encrypt session data before persisting
    this.config.set('auth.session', session);

    log.info(`[AuthService] Login successful: ${email}`);
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

    // TODO: Replace with real API call
    // const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, password, name }),
    // });

    const now = Date.now();
    const session: AuthSession = {
      user: {
        id: randomUUID(),
        email,
        name: name.trim(),
        edition: 'personal',
        createdAt: new Date(now).toISOString(),
      },
      accessToken: `mock_access_${randomUUID()}`,
      refreshToken: `mock_refresh_${randomUUID()}`,
      expiresAt: now + SESSION_DURATION_MS,
    };

    // Persist session to config
    // TODO: Encrypt session data before persisting
    this.config.set('auth.session', session);

    log.info(`[AuthService] Registration successful: ${email}`);
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
      log.info(`[AuthService] Session restored for ${raw.user.email}`);
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
