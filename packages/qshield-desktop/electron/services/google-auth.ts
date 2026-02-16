/**
 * Google OAuth 2.0 service for Electron.
 *
 * Handles the OAuth flow using a local HTTP callback server,
 * token storage/retrieval, and credential management.
 *
 * Security: Never logs tokens. Stores via electron-store encryption.
 * Scope: gmail.readonly + gmail.metadata (read-only access).
 */
import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import { shell } from 'electron';
import log from 'electron-log';
import http from 'node:http';
import { URL } from 'node:url';

// OAuth credentials — must be set via environment variables.
// In production, these come from Google Cloud Console (Desktop App type).
const GOOGLE_CLIENT_ID = process.env.QSHIELD_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.QSHIELD_GOOGLE_CLIENT_SECRET || '';
const REDIRECT_PORT = 18736;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.metadata',
];

const AUTH_TIMEOUT_MS = 120_000; // 2 minutes

export class GoogleAuthService {
  private oauth2Client: OAuth2Client;
  private tokens: Credentials | null = null;
  private userEmail: string | null = null;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI,
    );

    // Auto-refresh tokens when they expire
    this.oauth2Client.on('tokens', (newTokens) => {
      if (newTokens.refresh_token) {
        this.tokens = { ...this.tokens, ...newTokens };
      } else if (this.tokens) {
        this.tokens = { ...this.tokens, ...newTokens };
      }
      log.info('[GoogleAuth] Tokens refreshed');
    });
  }

  /** Whether we have valid (or refreshable) credentials */
  isAuthenticated(): boolean {
    return this.tokens?.refresh_token != null;
  }

  /** Get the authenticated OAuth2 client for API calls */
  getClient(): OAuth2Client {
    return this.oauth2Client;
  }

  /** Get the authenticated user's email address */
  getUserEmail(): string | null {
    return this.userEmail;
  }

  /** Set the user email (discovered after connecting to Gmail) */
  setUserEmail(email: string): void {
    this.userEmail = email;
  }

  /**
   * Start the OAuth consent flow.
   *
   * 1. Spins up a local HTTP server on REDIRECT_PORT
   * 2. Opens the Google consent URL in the user's default browser
   * 3. Receives the auth code callback
   * 4. Exchanges the code for access + refresh tokens
   * 5. Returns once tokens are stored
   */
  async authenticate(): Promise<void> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error(
        'Google OAuth credentials not configured. Set QSHIELD_GOOGLE_CLIENT_ID and QSHIELD_GOOGLE_CLIENT_SECRET environment variables.',
      );
    }

    return new Promise((resolve, reject) => {
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
      });

      let settled = false;

      const server = http.createServer(async (req, res) => {
        if (settled) return;
        try {
          const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);

          if (url.pathname !== '/callback') {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(
              '<html><body><h2>Authorization denied</h2><p>You can close this window.</p></body></html>',
            );
            settled = true;
            server.close();
            reject(new Error(`OAuth denied: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(
              '<html><body><h2>Missing authorization code</h2></body></html>',
            );
            settled = true;
            server.close();
            reject(new Error('No auth code received'));
            return;
          }

          // Exchange code for tokens
          const { tokens } = await this.oauth2Client.getToken(code);
          this.oauth2Client.setCredentials(tokens);
          this.tokens = tokens;

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>QShield connected to Gmail!</h2><p>You can close this window.</p><script>setTimeout(()=>window.close(),2000)</script></body></html>',
          );

          settled = true;
          server.close();
          log.info('[GoogleAuth] OAuth flow completed successfully');
          resolve();
        } catch (err) {
          if (!settled) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(
              '<html><body><h2>Authentication failed</h2><p>Please try again.</p></body></html>',
            );
            settled = true;
            server.close();
            reject(err);
          }
        }
      });

      server.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(`OAuth callback server error: ${err.message}`));
        }
      });

      server.listen(REDIRECT_PORT, () => {
        log.info('[GoogleAuth] OAuth callback server listening, opening browser...');
        shell.openExternal(authUrl);
      });

      // Timeout
      setTimeout(() => {
        if (!settled) {
          settled = true;
          server.close();
          reject(new Error('OAuth flow timed out after 2 minutes'));
        }
      }, AUTH_TIMEOUT_MS);
    });
  }

  /** Load previously saved tokens (call on app startup) */
  loadTokens(tokens: Record<string, unknown>): void {
    this.tokens = tokens as Credentials;
    this.userEmail = (tokens.userEmail as string) ?? null;
    if (this.tokens) {
      this.oauth2Client.setCredentials(this.tokens);
      log.info('[GoogleAuth] Tokens loaded from storage');
    }
  }

  /** Get tokens for persisting to config store */
  getTokens(): Record<string, unknown> | null {
    if (!this.tokens) return null;
    return {
      ...this.tokens,
      userEmail: this.userEmail,
    } as Record<string, unknown>;
  }

  /** Revoke tokens and clear credentials */
  async revoke(): Promise<void> {
    try {
      if (this.tokens?.access_token) {
        await this.oauth2Client.revokeToken(this.tokens.access_token as string);
        log.info('[GoogleAuth] Token revoked');
      }
    } catch (err) {
      log.warn('[GoogleAuth] Token revocation failed (may already be invalid):', err);
    }
    this.tokens = null;
    this.userEmail = null;
    this.oauth2Client.setCredentials({});
  }
}
