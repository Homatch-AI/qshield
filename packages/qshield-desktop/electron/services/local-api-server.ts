/**
 * Local HTTP API server — enables browser extension and other local
 * integrations to communicate with QShield Desktop.
 *
 * Binds to 127.0.0.1 only (never exposed to the network).
 * Requires X-QShield-Token header for all endpoints except /api/v1/health.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import log from 'electron-log';
import { generateVerificationBadgeHtml } from './signature-generator';
import type { ServiceRegistry } from '../ipc/handlers';

// ── Types ────────────────────────────────────────────────────────────────────

interface LocalApiDeps {
  getServices: () => ServiceRegistry | null;
  getTrustScore: () => number;
  getTrustLevel: () => string;
  getUserEmail: () => string;
  getUserName: () => string;
  getApiToken: () => string;
}

interface SignRequest {
  contentHash: string;
  subject?: string;
  recipients?: string[];
  timestamp: string;
  platform: string;
}

// ── Server ───────────────────────────────────────────────────────────────────

export class LocalApiServer {
  private server: Server | null = null;
  private port = 3847;
  private currentToken: string | null = null;
  private messagePageHtml: string | null = null;

  constructor(private deps: LocalApiDeps) {}

  /** Start the server. Tries up to 10 consecutive ports if the default is busy. */
  async start(port = 3847): Promise<void> {
    this.port = port;

    for (let attempt = 0; attempt <= 10; attempt++) {
      const tryPort = port + attempt;
      try {
        await this.listen(tryPort);
        this.port = tryPort;
        log.info(`[LocalAPI] Server listening on 127.0.0.1:${tryPort}`);
        return;
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          log.warn(`[LocalAPI] Port ${tryPort} busy, trying next...`);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`[LocalAPI] Could not find open port in range ${port}-${port + 10}`);
  }

  /** Stop the server gracefully. */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        log.info('[LocalAPI] Server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /** Return the port the server is actually listening on. */
  getPort(): number {
    return this.port;
  }

  /** Override the auth token used by the server. */
  setToken(token: string): void {
    this.currentToken = token;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          log.error('[LocalAPI] Unhandled error:', err);
          this.sendJson(res, 500, { error: 'Internal server error' });
        });
      });

      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', () => {
        this.server!.removeListener('error', reject);
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    const origin = req.headers.origin ?? '';
    const isDev = !app.isPackaged;
    if (isDev || origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-QShield-Token');

    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '';
    const method = req.method ?? 'GET';

    // Health endpoint — no auth required
    if (method === 'GET' && url === '/api/v1/health') {
      return this.handleHealth(res);
    }

    // Secure message viewer page — serves standalone HTML
    const messagePageMatch = url.match(/^\/m\/([a-f0-9]{12})$/);
    if (messagePageMatch && method === 'GET') {
      return this.handleMessagePage(res);
    }

    // Secure message endpoints — no auth required (public link access)
    const messageMatch = url.match(/^\/api\/v1\/message\/([a-f0-9]{12})$/);
    if (messageMatch && method === 'GET') {
      return this.handleMessageGet(messageMatch[1], res);
    }
    const messageAttachMatch = url.match(/^\/api\/v1\/message\/([a-f0-9]{12})\/attachment\/([a-f0-9]+)$/);
    if (messageAttachMatch && method === 'GET') {
      return this.handleAttachmentGet(messageAttachMatch[1], messageAttachMatch[2], res);
    }
    const messageVerifyMatch = url.match(/^\/api\/v1\/message\/([a-f0-9]{12})\/verify$/);
    if (messageVerifyMatch && method === 'POST') {
      return this.handleMessageVerify(messageVerifyMatch[1], req, res);
    }

    // All other endpoints require auth token
    const token = req.headers['x-qshield-token'] as string | undefined;
    const expectedToken = this.currentToken ?? this.deps.getApiToken();
    if (!token || token !== expectedToken) {
      return this.sendJson(res, 401, { error: 'Unauthorized — missing or invalid X-QShield-Token header' });
    }

    // Route
    if (method === 'POST' && url === '/api/v1/email/sign') {
      return this.handleEmailSign(req, res);
    }
    if (method === 'GET' && url === '/api/v1/email/status') {
      return this.handleEmailStatus(res);
    }
    if (method === 'POST' && url === '/api/v1/email/verify-click') {
      return this.handleVerifyClick(req, res);
    }
    if (method === 'POST' && url === '/api/v1/message/create') {
      return this.handleCreateMessage(req, res);
    }

    this.sendJson(res, 404, { error: 'Not found' });
  }

  // ── Route handlers ───────────────────────────────────────────────────────

  private handleHealth(res: ServerResponse): void {
    this.sendJson(res, 200, {
      status: 'ok',
      version: '1.1.0',
      trustScore: this.deps.getTrustScore(),
      trustLevel: this.deps.getTrustLevel(),
    });
  }

  private handleMessagePage(res: ServerResponse): void {
    if (!this.messagePageHtml) {
      try {
        // app.getAppPath() → project root in dev, asar in prod
        const appRoot = app.getAppPath();
        const devPath = join(appRoot, 'src', 'verification-page', 'message.html');
        const prodPath = join(process.resourcesPath ?? '', 'verification-page', 'message.html');
        const filePath = app.isPackaged ? prodPath : devPath;
        this.messagePageHtml = readFileSync(filePath, 'utf-8');
      } catch (err) {
        log.error('[LocalAPI] Failed to read message.html:', err);
        this.sendJson(res, 500, { error: 'Message viewer page not found' });
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(this.messagePageHtml);
  }

  private async handleEmailSign(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const services = this.deps.getServices();
    if (!services) {
      return this.sendJson(res, 503, { error: 'Desktop services not ready' });
    }

    const body = await this.readBody(req);
    if (!body) {
      return this.sendJson(res, 400, { error: 'Request body is required' });
    }

    let parsed: SignRequest;
    try {
      parsed = JSON.parse(body);
    } catch {
      return this.sendJson(res, 400, { error: 'Invalid JSON' });
    }

    // Validate required fields
    if (!parsed.contentHash || typeof parsed.contentHash !== 'string') {
      return this.sendJson(res, 400, { error: 'contentHash is required' });
    }
    if (parsed.recipients && !Array.isArray(parsed.recipients)) {
      return this.sendJson(res, 400, { error: 'recipients must be an array' });
    }
    if (!parsed.timestamp || !parsed.platform) {
      return this.sendJson(res, 400, { error: 'timestamp and platform are required' });
    }

    const trustScore = this.deps.getTrustScore();
    const trustLevel = this.deps.getTrustLevel();
    const senderEmail = this.deps.getUserEmail();
    const senderName = this.deps.getUserName();

    // Create verification record
    const record = services.verificationService.createRecord({
      senderName,
      senderEmail,
      trustScore,
      trustLevel,
      emailSubject: parsed.subject,
    });

    // Log evidence (content hash + recipient hashes)
    const recipientHashes = (parsed.recipients ?? []).map((r: string) =>
      createHash('sha256').update(r.toLowerCase()).digest('hex').slice(0, 16),
    );
    log.info(`[LocalAPI] Email signed: verification=${record.verificationId}, recipients=${recipientHashes.length}, platform=${parsed.platform}`);

    // Determine if branding should show (free tier shows branding)
    const edition = services.licenseManager.getEdition();
    const showBranding = edition === 'free';

    // Generate compact badge HTML
    const badgeHtml = generateVerificationBadgeHtml({
      verifyUrl: record.verifyUrl,
      trustScore,
      trustLevel,
      senderName,
      showBranding,
    });

    this.sendJson(res, 200, {
      verificationId: record.verificationId,
      verifyUrl: record.verifyUrl,
      trustScore,
      trustLevel,
      badgeHtml,
      timestamp: new Date().toISOString(),
    });
  }

  private handleEmailStatus(res: ServerResponse): void {
    const services = this.deps.getServices();
    if (!services) {
      return this.sendJson(res, 503, { error: 'Desktop services not ready' });
    }

    const stats = services.verificationService.getStats() as {
      totalGenerated: number;
    };
    const edition = services.licenseManager.getEdition();

    // Daily limit based on edition
    const dailyLimits: Record<string, number> = {
      free: 5,
      personal: 50,
      business: 500,
      enterprise: -1,
    };

    this.sendJson(res, 200, {
      authenticated: this.deps.getUserEmail() !== 'user@qshield.io',
      edition,
      verificationsToday: stats.totalGenerated,
      dailyLimit: dailyLimits[edition] ?? 5,
    });
  }

  private async handleVerifyClick(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const services = this.deps.getServices();
    if (!services) {
      return this.sendJson(res, 503, { error: 'Desktop services not ready' });
    }

    const body = await this.readBody(req);
    if (!body) {
      return this.sendJson(res, 400, { error: 'Request body is required' });
    }

    let parsed: { verificationId?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      return this.sendJson(res, 400, { error: 'Invalid JSON' });
    }

    if (!parsed.verificationId || typeof parsed.verificationId !== 'string') {
      return this.sendJson(res, 400, { error: 'verificationId is required' });
    }

    services.verificationService.recordClick(parsed.verificationId);
    this.sendJson(res, 200, { recorded: true });
  }

  // ── Secure message handlers ─────────────────────────────────────────────

  private handleMessageGet(id: string, res: ServerResponse): void {
    const services = this.deps.getServices();
    if (!services) {
      return this.sendJson(res, 503, { error: 'Desktop services not ready' });
    }

    const msg = services.secureMessageService.get(id) as {
      status: string;
      expiresAt: string;
      subject: string;
      contentEncrypted: string;
      iv: string;
      senderName: string;
      requireVerification: boolean;
      accessLog: unknown[];
      attachments: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number }>;
    } | null;

    if (!msg) {
      return this.sendJson(res, 404, { error: 'Message not found' });
    }

    if (msg.status === 'destroyed') {
      return this.sendJson(res, 410, { error: 'Message has been destroyed' });
    }

    if (msg.status === 'expired' || new Date(msg.expiresAt) <= new Date()) {
      return this.sendJson(res, 410, { error: 'Message has expired' });
    }

    // Record access
    services.secureMessageService.recordAccess(id, {
      ip: 'local',
      userAgent: 'api-client',
      action: 'viewed',
    });

    // Return attachment metadata (without encrypted data — fetched separately)
    const attachmentMeta = (msg.attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    }));

    this.sendJson(res, 200, {
      subject: msg.subject,
      contentEncrypted: msg.contentEncrypted,
      iv: msg.iv,
      expiresAt: msg.expiresAt,
      senderName: msg.senderName,
      trustScore: this.deps.getTrustScore(),
      requireVerification: msg.requireVerification,
      attachments: attachmentMeta,
    });
  }

  private handleAttachmentGet(messageId: string, attachmentId: string, res: ServerResponse): void {
    const services = this.deps.getServices();
    if (!services) {
      return this.sendJson(res, 503, { error: 'Desktop services not ready' });
    }

    const msg = services.secureMessageService.get(messageId) as {
      status: string;
      expiresAt: string;
      attachments: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number; dataEncrypted: string; iv: string }>;
    } | null;

    if (!msg) {
      return this.sendJson(res, 404, { error: 'Message not found' });
    }

    if (msg.status === 'destroyed' || msg.status === 'expired' || new Date(msg.expiresAt) <= new Date()) {
      return this.sendJson(res, 410, { error: 'Message is no longer available' });
    }

    const attachment = (msg.attachments ?? []).find((a) => a.id === attachmentId);
    if (!attachment) {
      return this.sendJson(res, 404, { error: 'Attachment not found' });
    }

    // Record file download access
    services.secureMessageService.recordAccess(messageId, {
      ip: 'local',
      userAgent: 'api-client',
      action: 'file_downloaded',
    });

    this.sendJson(res, 200, {
      dataEncrypted: attachment.dataEncrypted,
      iv: attachment.iv,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
    });
  }

  private async handleCreateMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const services = this.deps.getServices();
    if (!services) {
      return this.sendJson(res, 503, { error: 'Desktop services not ready' });
    }

    const body = await this.readBody(req);
    if (!body) {
      return this.sendJson(res, 400, { error: 'Request body is required' });
    }

    let parsed: {
      subject?: string;
      content?: string;
      recipients?: string[];
      expiresIn?: string;
      maxViews?: number;
      requireVerification?: boolean;
    };
    try {
      parsed = JSON.parse(body);
    } catch {
      return this.sendJson(res, 400, { error: 'Invalid JSON' });
    }

    if (!parsed.content || typeof parsed.content !== 'string') {
      return this.sendJson(res, 400, { error: 'content is required' });
    }

    try {
      const result = await services.secureMessageService.create({
        subject: parsed.subject || 'Secure Message',
        content: parsed.content,
        expiresIn: parsed.expiresIn || '24h',
        maxViews: parsed.maxViews ?? -1,
        requireVerification: parsed.requireVerification ?? false,
        allowedRecipients: parsed.recipients,
      }) as { id: string; shareUrl: string; expiresAt: string };

      log.info(`[LocalAPI] Secure message created: id=${result.id}`);

      this.sendJson(res, 200, {
        messageId: result.id,
        shareUrl: result.shareUrl,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      log.error('[LocalAPI] Create secure message failed:', err);
      this.sendJson(res, 500, { error: (err as Error).message || 'Failed to create secure message' });
    }
  }

  private async handleMessageVerify(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const services = this.deps.getServices();
    if (!services) {
      return this.sendJson(res, 503, { error: 'Desktop services not ready' });
    }

    const body = await this.readBody(req);
    if (!body) {
      return this.sendJson(res, 400, { error: 'Request body is required' });
    }

    let parsed: { email?: string; code?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      return this.sendJson(res, 400, { error: 'Invalid JSON' });
    }

    if (!parsed.email || !parsed.code) {
      return this.sendJson(res, 400, { error: 'email and code are required' });
    }

    // Mock verification: accept any 6-digit code
    if (!/^\d{6}$/.test(parsed.code)) {
      return this.sendJson(res, 403, { error: 'Invalid verification code' });
    }

    const content = services.secureMessageService.getDecryptedContent(id) as string | null;
    if (!content) {
      return this.sendJson(res, 404, { error: 'Message not found or destroyed' });
    }

    services.secureMessageService.recordAccess(id, {
      ip: 'local',
      userAgent: 'api-client',
      recipientEmail: parsed.email,
      action: 'verified',
    });

    this.sendJson(res, 200, { verified: true, content });
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readBody(req: IncomingMessage): Promise<string | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const MAX_BODY = 64 * 1024; // 64KB limit

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          resolve(null);
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (size > MAX_BODY) {
          resolve(null);
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      req.on('error', () => resolve(null));
    });
  }
}
