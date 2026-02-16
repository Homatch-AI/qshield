/**
 * Real Gmail monitoring adapter.
 *
 * Uses Google Gmail API to poll for new messages and emit trust-scored
 * AdapterEvents. Analyses email headers for SPF/DKIM verification,
 * attachment risk, and sender classification (internal vs external).
 *
 * Requires a GoogleAuthService instance with valid OAuth tokens.
 * Falls back to idle (no events) when not authenticated.
 */
import log from 'electron-log';
import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';
import type { GoogleAuthService } from '../services/google-auth';

/** Default poll interval: 60 seconds */
const DEFAULT_POLL_MS = 60_000;

/** Risky attachment extensions */
const RISKY_EXTS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.js', '.vbs', '.scr', '.msi', '.com',
  '.pif', '.hta', '.wsf', '.jar',
]);

/** Large attachment threshold: 10 MB */
const LARGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Gmail adapter — real implementation backed by Google Gmail API.
 *
 * Overrides BaseAdapter's start() to use its own polling timer
 * (no simulation timer). Emits real AdapterEvent objects that flow
 * through the TrustMonitor pipeline unchanged.
 */
export class EmailAdapter extends BaseAdapter {
  readonly id: AdapterType = 'email';
  readonly name = 'Email Monitor';
  protected override defaultInterval = DEFAULT_POLL_MS;

  private authService: GoogleAuthService;
  private gmail: gmail_v1.Gmail | null = null;
  private lastHistoryId: string | undefined;
  private userEmail = '';
  private internalDomains: string[] = [];
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(authService: GoogleAuthService) {
    super();
    this.authService = authService;
    this.pollInterval = this.defaultInterval;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    if (Array.isArray(config.internalDomains)) {
      this.internalDomains = config.internalDomains as string[];
    }

    log.info('[GmailAdapter] Initialized');
  }

  /**
   * Start real Gmail polling.
   * Does NOT call super.start() — bypasses the simulation timer.
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      log.warn('[GmailAdapter] Cannot start: adapter not initialized');
      return;
    }

    if (!this.authService.isAuthenticated()) {
      log.warn(
        '[GmailAdapter] Not authenticated — adapter idle. User must connect Gmail first.',
      );
      // Still mark as enabled but not connected
      return;
    }

    try {
      this.gmail = google.gmail({
        version: 'v1',
        auth: this.authService.getClient(),
      });

      // Get user profile for email and initial historyId
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.lastHistoryId = profile.data.historyId ?? undefined;
      this.userEmail = profile.data.emailAddress ?? '';
      this.authService.setUserEmail(this.userEmail);

      // Derive internal domain from user's email
      const userDomain = this.extractDomain(this.userEmail);
      if (userDomain && !this.internalDomains.includes(userDomain)) {
        this.internalDomains.push(userDomain);
      }

      this.connected = true;
      log.info(
        `[GmailAdapter] Connected as ${this.userEmail}, starting poll loop`,
      );
      this.schedulePoll();
    } catch (err) {
      this.errorCount++;
      this.lastError = err instanceof Error ? err.message : String(err);
      log.error('[GmailAdapter] Failed to start:', err);
    }
  }

  async stop(): Promise<void> {
    this.clearPollTimer();
    this.gmail = null;
    await super.stop();
    log.info('[GmailAdapter] Stopped');
  }

  async destroy(): Promise<void> {
    this.clearPollTimer();
    this.gmail = null;
    await super.destroy();
    log.info('[GmailAdapter] Destroyed');
  }

  /** Required by BaseAdapter but never called — real events come from polling */
  protected generateSimulatedEvent(): AdapterEvent {
    throw new Error('EmailAdapter uses real Gmail events, not simulation');
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  private schedulePoll(): void {
    if (!this.connected) return;
    this.pollTimer = setTimeout(async () => {
      await this.pollForChanges();
      this.schedulePoll();
    }, this.pollInterval);
  }

  private clearPollTimer(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollForChanges(): Promise<void> {
    if (!this.gmail || !this.lastHistoryId) return;

    try {
      const history = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: this.lastHistoryId,
        historyTypes: ['messageAdded'],
      });

      const newHistoryId = history.data.historyId;
      const changes = history.data.history ?? [];

      for (const change of changes) {
        for (const added of change.messagesAdded ?? []) {
          if (added.message?.id) {
            await this.processMessage(this.gmail, added.message.id);
          }
        }
      }

      if (newHistoryId) {
        this.lastHistoryId = newHistoryId;
      }
    } catch (err: unknown) {
      const apiErr = err as { code?: number; message?: string };

      // 404 = historyId too old; do a full sync to recover
      if (apiErr.code === 404) {
        log.warn('[GmailAdapter] History expired, re-syncing');
        await this.fullSync();
      } else {
        this.errorCount++;
        this.lastError = apiErr.message ?? String(err);
        log.error('[GmailAdapter] Poll error:', err);
      }
    }
  }

  /**
   * Full sync fallback: list the most recent 10 messages
   * and reset the historyId.
   */
  private async fullSync(): Promise<void> {
    if (!this.gmail) return;

    try {
      const list = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: 10,
        labelIds: ['INBOX'],
      });

      for (const msg of list.data.messages ?? []) {
        if (msg.id) {
          await this.processMessage(this.gmail, msg.id);
        }
      }

      // Reset historyId from profile
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.lastHistoryId = profile.data.historyId ?? undefined;
    } catch (err) {
      this.errorCount++;
      this.lastError = err instanceof Error ? err.message : String(err);
      log.error('[GmailAdapter] Full sync error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Message processing
  // ---------------------------------------------------------------------------

  private async processMessage(
    gmail: gmail_v1.Gmail,
    messageId: string,
  ): Promise<void> {
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: [
          'From',
          'To',
          'Subject',
          'Date',
          'Content-Type',
          'Authentication-Results',
          'Received-SPF',
          'DKIM-Signature',
          'X-Mailer',
        ],
      });

      const headers = this.parseHeaders(msg.data.payload?.headers ?? []);
      const from = headers['from'] ?? '';
      const to = headers['to'] ?? '';
      const subject = headers['subject'] ?? '';
      const authResults = headers['authentication-results'] ?? '';
      const spfResult = headers['received-spf'] ?? '';

      const isExternal = !this.isInternalSender(from);
      const labelIds = msg.data.labelIds ?? [];
      const isSent = labelIds.includes('SENT');
      const hasAttachments = (msg.data.payload?.parts ?? []).some(
        (p) => p.filename && p.filename.length > 0,
      );
      const totalSize = parseInt(
        msg.data.sizeEstimate?.toString() ?? '0',
        10,
      );

      // Base event: sent or received
      if (isSent) {
        this.emitEmailEvent('email-sent', { from, to, subject, size: totalSize }, 3);
      } else {
        this.emitEmailEvent(
          'email-received',
          {
            from,
            to,
            subject,
            isExternal,
            size: totalSize,
            snippet: msg.data.snippet?.substring(0, 100),
          },
          isExternal ? -5 : 5,
        );
      }

      // Attachment analysis
      if (hasAttachments) {
        const attachments = (msg.data.payload?.parts ?? [])
          .filter((p) => p.filename && p.filename.length > 0)
          .map((p) => ({
            fileName: p.filename ?? '',
            mimeType: p.mimeType ?? '',
            size: parseInt(p.body?.size?.toString() ?? '0', 10),
          }));

        const hasRiskyAttachment = attachments.some((a) =>
          RISKY_EXTS.has(this.getExtension(a.fileName)),
        );
        const totalAttachmentSize = attachments.reduce(
          (sum, a) => sum + a.size,
          0,
        );
        const isLarge = totalAttachmentSize > LARGE_ATTACHMENT_BYTES;

        let attachmentImpact = -5;
        if (hasRiskyAttachment) attachmentImpact = -15;
        if (isLarge) attachmentImpact -= 15;

        this.emitEmailEvent(
          'attachment-detected',
          {
            from,
            subject,
            attachments,
            hasRiskyAttachment,
            isLarge,
            totalAttachmentSize,
          },
          attachmentImpact,
        );
      }

      // SPF analysis
      const spfLower = spfResult.toLowerCase();
      if (spfLower.includes('pass')) {
        this.emitEmailEvent(
          'spf-pass',
          { domain: this.extractDomain(from), raw: spfResult },
          15,
        );
      } else if (
        spfLower.includes('fail') ||
        spfLower.includes('softfail')
      ) {
        this.emitEmailEvent(
          'spf-fail',
          { domain: this.extractDomain(from), raw: spfResult },
          -25,
        );
      }

      // DKIM analysis
      const authLower = authResults.toLowerCase();
      if (authLower.includes('dkim=pass')) {
        this.emitEmailEvent(
          'dkim-verified',
          { domain: this.extractDomain(from) },
          15,
        );
      } else if (authLower.includes('dkim=fail')) {
        this.emitEmailEvent(
          'dkim-fail',
          { domain: this.extractDomain(from) },
          -20,
        );
      }

      // External sender flag
      if (isExternal && !isSent) {
        const senderDomain = this.extractDomain(from);
        this.emitEmailEvent(
          'external-sender',
          { from, domain: senderDomain, subject },
          -10,
        );
      }
    } catch (err) {
      log.warn(
        `[GmailAdapter] Error processing message ${messageId}:`,
        err,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private emitEmailEvent(
    eventType: string,
    data: Record<string, unknown>,
    trustImpact: number,
  ): void {
    const event: AdapterEvent = {
      adapterId: this.id,
      eventType,
      timestamp: new Date().toISOString(),
      data: { ...data, userEmail: this.userEmail },
      trustImpact: Math.max(-100, Math.min(100, trustImpact)),
    };
    this.emitEvent(event);
  }

  private parseHeaders(
    headers: gmail_v1.Schema$MessagePartHeader[],
  ): Record<string, string> {
    const map: Record<string, string> = {};
    for (const h of headers) {
      if (h.name && h.value) {
        map[h.name.toLowerCase()] = h.value;
      }
    }
    return map;
  }

  private isInternalSender(from: string): boolean {
    const domain = this.extractDomain(from);
    if (!domain) return false;
    return this.internalDomains.some(
      (d) => domain === d || domain.endsWith(`.${d}`),
    );
  }

  private extractDomain(emailOrFrom: string): string {
    // Handle "Name <email@domain>" format
    const match = emailOrFrom.match(/<([^>]+)>/) ?? [null, emailOrFrom];
    const email = match[1] ?? emailOrFrom;
    const parts = email.split('@');
    return (parts[1] ?? '').toLowerCase().trim();
  }

  private getExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot >= 0 ? fileName.substring(dot).toLowerCase() : '';
  }
}
