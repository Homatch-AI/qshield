/**
 * Secure Message Service — create, encrypt, and manage self-destructing
 * messages with AES-256-GCM encryption and evidence chain tracking.
 *
 * Keys are stored locally and shared via URL fragment (#key) so they
 * are never sent to the server.
 */
import { createHmac, createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import log from 'electron-log';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccessLogEntry {
  timestamp: string;
  ip: string;
  userAgent: string;
  recipientEmail?: string;
  action: 'viewed' | 'downloaded' | 'file_downloaded' | 'verified' | 'expired' | 'destroyed';
}

export interface SecureAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  dataEncrypted: string;
  iv: string;
  hash: string;
}

export interface SecureMessage {
  id: string;
  createdAt: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  contentEncrypted: string;
  contentHash: string;
  iv: string;
  key: string;
  attachments: SecureAttachment[];
  expiresAt: string;
  maxViews: number;
  currentViews: number;
  requireVerification: boolean;
  allowedRecipients: string[];
  status: 'active' | 'expired' | 'destroyed' | 'draft';
  evidenceChainHash: string;
  accessLog: AccessLogEntry[];
}

export interface AttachmentInput {
  filename: string;
  mimeType: string;
  data: string; // base64-encoded file content
}

export interface CreateMessageOpts {
  subject: string;
  content: string;
  attachments?: AttachmentInput[];
  expiresIn: '1h' | '24h' | '7d' | '30d';
  maxViews: number;
  requireVerification: boolean;
  allowedRecipients: string[];
}

export interface MessageSummary {
  id: string;
  subject: string;
  createdAt: string;
  expiresAt: string;
  status: string;
  currentViews: number;
  maxViews: number;
  attachmentCount: number;
  totalAttachmentSize: number;
  shareUrl: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const HMAC_KEY = 'qshield-secure-msg-v1';
const MESSAGE_BASE_URL = 'https://qshield.io/m';
const MAX_MESSAGES = 100;

const EXPIRY_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/** Attachment limits by edition: [maxTotalBytes, maxFiles] */
const ATTACHMENT_LIMITS: Record<string, [number, number]> = {
  free: [0, 0],
  personal: [1 * 1024 * 1024, 3],
  business: [10 * 1024 * 1024, 10],
  enterprise: [100 * 1024 * 1024, 50],
};

// ── Service ──────────────────────────────────────────────────────────────────

export class SecureMessageService {
  private messages: SecureMessage[] = [];
  private persistFn: ((messages: SecureMessage[]) => void) | null = null;
  private editionFn: (() => string) | null = null;

  constructor() {}

  /** Set a callback to persist messages to config. */
  setPersist(fn: (messages: SecureMessage[]) => void): void {
    this.persistFn = fn;
  }

  /** Set a callback to get the current edition for attachment limits. */
  setEditionProvider(fn: () => string): void {
    this.editionFn = fn;
  }

  /** Load persisted messages. */
  load(messages: SecureMessage[]): void {
    this.messages = messages;
  }

  /** Create a new encrypted secure message. */
  create(opts: CreateMessageOpts, senderName: string, senderEmail: string): MessageSummary {
    const createdAt = new Date().toISOString();
    const id = this.generateId(createdAt);

    // Generate AES-256-GCM key and IV
    const key = randomBytes(32);
    const iv = randomBytes(12);

    // Encrypt content
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(opts.content, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    const contentEncrypted = encrypted + '.' + authTag.toString('base64');

    // Content hash for evidence
    const contentHash = createHmac('sha256', HMAC_KEY).update(opts.content).digest('hex');

    // Encrypt attachments
    const attachments = this.encryptAttachments(opts.attachments ?? [], key);

    // Calculate expiry
    const expiresAt = new Date(Date.now() + EXPIRY_MS[opts.expiresIn]).toISOString();

    // Evidence chain hash
    const evidenceChainHash = createHmac('sha256', HMAC_KEY)
      .update(`${id}:${contentHash}:${createdAt}:${senderEmail}`)
      .digest('hex');

    const message: SecureMessage = {
      id,
      createdAt,
      senderName,
      senderEmail,
      subject: opts.subject,
      contentEncrypted,
      contentHash,
      iv: iv.toString('base64'),
      key: key.toString('base64'),
      attachments,
      expiresAt,
      maxViews: opts.maxViews,
      currentViews: 0,
      requireVerification: opts.requireVerification,
      allowedRecipients: opts.allowedRecipients,
      status: 'active',
      evidenceChainHash,
      accessLog: [],
    };

    this.messages.unshift(message);
    if (this.messages.length > MAX_MESSAGES) this.messages.length = MAX_MESSAGES;
    this.persist();

    log.info(`[SecureMessage] Created: ${id} (expires: ${opts.expiresIn}, maxViews: ${opts.maxViews}, attachments: ${attachments.length})`);

    return this.toSummary(message);
  }

  /** Get a message by ID. */
  get(id: string): SecureMessage | null {
    return this.messages.find((m) => m.id === id) ?? null;
  }

  /** List all messages as summaries, sorted by createdAt desc. */
  list(): MessageSummary[] {
    return this.messages.map((m) => this.toSummary(m));
  }

  /** Decrypt and return the plaintext content. */
  getDecryptedContent(id: string): string | null {
    const msg = this.messages.find((m) => m.id === id);
    if (!msg || msg.status === 'destroyed') return null;

    try {
      const key = Buffer.from(msg.key, 'base64');
      const iv = Buffer.from(msg.iv, 'base64');
      const [enc, authTagB64] = msg.contentEncrypted.split('.');
      const authTag = Buffer.from(authTagB64, 'base64');

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(enc, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      log.error(`[SecureMessage] Decryption failed for ${id}:`, err);
      return null;
    }
  }

  /** Record an access event. Returns false if message is expired/destroyed. */
  recordAccess(id: string, entry: Omit<AccessLogEntry, 'timestamp'>): boolean {
    const msg = this.messages.find((m) => m.id === id);
    if (!msg) return false;

    // Check status
    if (msg.status === 'expired' || msg.status === 'destroyed') return false;

    // Check expiration
    if (new Date(msg.expiresAt) <= new Date()) {
      msg.status = 'expired';
      this.persist();
      return false;
    }

    msg.accessLog.push({ ...entry, timestamp: new Date().toISOString() });
    msg.currentViews++;

    // Auto-destroy if max views reached
    if (msg.maxViews !== -1 && msg.currentViews >= msg.maxViews) {
      msg.status = 'destroyed';
      msg.contentEncrypted = '';
      msg.attachments = [];
      log.info(`[SecureMessage] Auto-destroyed ${id} after ${msg.currentViews} views`);
    }

    this.persist();
    return true;
  }

  /** Manually destroy a message. */
  destroy(id: string): boolean {
    const msg = this.messages.find((m) => m.id === id);
    if (!msg) return false;

    msg.status = 'destroyed';
    msg.contentEncrypted = '';
    msg.attachments = [];
    this.persist();

    log.info(`[SecureMessage] Destroyed: ${id}`);
    return true;
  }

  /** Check all active messages for expiration. */
  checkExpiration(): void {
    const now = new Date();
    for (const msg of this.messages) {
      if (msg.status === 'active' && new Date(msg.expiresAt) <= now) {
        msg.status = 'expired';
        log.info(`[SecureMessage] Expired: ${msg.id}`);
      }
    }
    this.persist();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private generateId(timestamp: string): string {
    const data = `${timestamp}:${randomBytes(8).toString('hex')}`;
    return createHmac('sha256', HMAC_KEY).update(data).digest('hex').slice(0, 12);
  }

  private encryptAttachments(inputs: AttachmentInput[], key: Buffer): SecureAttachment[] {
    if (inputs.length === 0) return [];

    // Check edition limits
    const edition = this.editionFn?.() ?? 'personal';
    const [maxBytes, maxFiles] = ATTACHMENT_LIMITS[edition] ?? ATTACHMENT_LIMITS.personal;

    if (maxFiles === 0) {
      throw new Error('File attachments are not available on your current plan');
    }
    if (inputs.length > maxFiles) {
      throw new Error(`Maximum ${maxFiles} attachments allowed on ${edition} plan`);
    }

    let totalSize = 0;
    const attachments: SecureAttachment[] = [];

    for (const input of inputs) {
      const fileData = Buffer.from(input.data, 'base64');
      totalSize += fileData.length;

      if (totalSize > maxBytes) {
        throw new Error(`Total attachment size exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit for ${edition} plan`);
      }

      // Separate IV per attachment
      const attIv = randomBytes(12);
      const attCipher = createCipheriv('aes-256-gcm', key, attIv);
      let encData = attCipher.update(fileData).toString('base64');
      encData += attCipher.final().toString('base64');
      const attAuthTag = attCipher.getAuthTag();
      const dataEncrypted = encData + '.' + attAuthTag.toString('base64');

      // SHA-256 hash of original file
      const hash = createHash('sha256').update(fileData).digest('hex');

      attachments.push({
        id: randomBytes(4).toString('hex'),
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: fileData.length,
        dataEncrypted,
        iv: attIv.toString('base64'),
        hash,
      });
    }

    return attachments;
  }

  private toSummary(msg: SecureMessage): MessageSummary {
    const keyBase64Url = msg.key
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const attachments = msg.attachments ?? [];

    return {
      id: msg.id,
      subject: msg.subject,
      createdAt: msg.createdAt,
      expiresAt: msg.expiresAt,
      status: msg.status,
      currentViews: msg.currentViews,
      maxViews: msg.maxViews,
      attachmentCount: attachments.length,
      totalAttachmentSize: attachments.reduce((sum, a) => sum + a.sizeBytes, 0),
      shareUrl: `${MESSAGE_BASE_URL}/${msg.id}#${keyBase64Url}`,
    };
  }

  private persist(): void {
    if (this.persistFn) {
      this.persistFn(this.messages);
    }
  }
}
