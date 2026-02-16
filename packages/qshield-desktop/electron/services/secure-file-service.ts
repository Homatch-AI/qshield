/**
 * Secure file storage and encryption service.
 *
 * Encrypts files with AES-256-GCM, stores encrypted blobs on disk,
 * and maintains a JSON metadata index. Keys are stored locally only;
 * share URLs embed the key in the URL fragment (never sent to server).
 */
import { createCipheriv, createHmac, createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import log from 'electron-log';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileAccessEntry {
  timestamp: string;
  action: 'downloaded' | 'viewed' | 'expired' | 'destroyed';
  ip: string;
  userAgent: string;
}

export interface SecureFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  encryptedPath: string;
  contentHash: string;
  iv: string;
  authTag: string;
  key: string;
  createdAt: string;
  expiresAt: string;
  maxDownloads: number;
  currentDownloads: number;
  status: 'active' | 'expired' | 'destroyed';
  senderName: string;
  senderEmail: string;
  accessLog: FileAccessEntry[];
  evidenceChainHash: string;
}

export interface UploadFileOpts {
  fileName: string;
  mimeType: string;
  data: Buffer;
  expiresIn: '1h' | '24h' | '7d' | '30d';
  maxDownloads: number;
}

export interface SecureFileSummary {
  id: string;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
  status: string;
  currentDownloads: number;
  maxDownloads: number;
  shareUrl: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const HMAC_KEY = 'qshield-secure-file-v1';
const INDEX_FILE = 'index.json';
const MAX_STORED_FILES = 200;

const EXPIRY_MAP: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// ── Service ──────────────────────────────────────────────────────────────────

export class SecureFileService {
  private files: SecureFile[] = [];
  private storagePath: string;
  private maxFileSize = 10 * 1024 * 1024; // 10 MB default

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    mkdirSync(storagePath, { recursive: true });
    this.loadIndex();
  }

  /** Set the maximum allowed file size in bytes. */
  setMaxFileSize(bytes: number): void {
    this.maxFileSize = bytes;
  }

  /** Get the maximum allowed file size in bytes. */
  getMaxFileSize(): number {
    return this.maxFileSize;
  }

  /** Upload and encrypt a file. Returns a summary with share URL. */
  upload(opts: UploadFileOpts, senderName: string, senderEmail: string): SecureFileSummary {
    if (opts.data.length > this.maxFileSize) {
      throw new Error(`File exceeds maximum size of ${Math.round(this.maxFileSize / (1024 * 1024))} MB`);
    }

    // Enforce storage limit — evict oldest expired first
    this.enforceStorageLimit();

    const timestamp = new Date().toISOString();
    const id = this.generateId(timestamp);

    // Generate AES-256-GCM key and IV
    const key = randomBytes(32);
    const iv = randomBytes(16);

    // Encrypt
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(opts.data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Write encrypted blob to disk
    const encryptedPath = join(this.storagePath, `${id}.enc`);
    writeFileSync(encryptedPath, encrypted);

    // Compute content hash
    const contentHash = createHash('sha256').update(opts.data).digest('hex');

    // Evidence chain hash
    const evidenceChainHash = createHmac('sha256', HMAC_KEY)
      .update(`${id}:${contentHash}:${timestamp}:${senderEmail}`)
      .digest('hex');

    // Compute expiry
    const expiryMs = EXPIRY_MAP[opts.expiresIn] ?? EXPIRY_MAP['24h'];
    const expiresAt = new Date(Date.now() + expiryMs).toISOString();

    const file: SecureFile = {
      id,
      originalName: opts.fileName,
      mimeType: opts.mimeType,
      sizeBytes: opts.data.length,
      encryptedPath,
      contentHash,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      key: key.toString('base64'),
      createdAt: timestamp,
      expiresAt,
      maxDownloads: opts.maxDownloads,
      currentDownloads: 0,
      status: 'active',
      senderName,
      senderEmail,
      accessLog: [],
      evidenceChainHash,
    };

    this.files.unshift(file);
    this.saveIndex();

    log.info(`[SecureFile] Uploaded: id=${id}, name=${opts.fileName}, size=${opts.data.length}`);

    return this.toSummary(file);
  }

  /** Get a file by ID. */
  get(id: string): SecureFile | null {
    return this.files.find((f) => f.id === id) ?? null;
  }

  /** List all files as summaries. */
  list(): SecureFileSummary[] {
    return this.files.map((f) => this.toSummary(f));
  }

  /** Read the encrypted data from disk for client-side decryption. */
  getEncryptedData(id: string): { data: Buffer; iv: string; authTag: string } | null {
    const file = this.files.find((f) => f.id === id);
    if (!file || file.status !== 'active') return null;

    // Check expiry
    if (new Date(file.expiresAt) <= new Date()) {
      this.expireFile(file);
      return null;
    }

    try {
      const data = readFileSync(file.encryptedPath);
      return { data, iv: file.iv, authTag: file.authTag };
    } catch {
      log.error(`[SecureFile] Failed to read encrypted blob: ${file.encryptedPath}`);
      return null;
    }
  }

  /** Record a download. Returns false if the file is expired/destroyed. */
  recordDownload(id: string, entry: Omit<FileAccessEntry, 'timestamp'>): boolean {
    const file = this.files.find((f) => f.id === id);
    if (!file) return false;

    if (file.status !== 'active' || new Date(file.expiresAt) <= new Date()) {
      if (file.status === 'active') this.expireFile(file);
      return false;
    }

    file.currentDownloads++;
    file.accessLog.push({ ...entry, timestamp: new Date().toISOString() });

    // Check download limit
    if (file.maxDownloads !== -1 && file.currentDownloads >= file.maxDownloads) {
      this.destroyFile(file);
    }

    this.saveIndex();
    return true;
  }

  /** Record a view access. */
  recordView(id: string, entry: Omit<FileAccessEntry, 'timestamp'>): boolean {
    const file = this.files.find((f) => f.id === id);
    if (!file || file.status !== 'active') return false;

    if (new Date(file.expiresAt) <= new Date()) {
      this.expireFile(file);
      return false;
    }

    file.accessLog.push({ ...entry, timestamp: new Date().toISOString() });
    this.saveIndex();
    return true;
  }

  /** Destroy a file — delete encrypted blob and mark as destroyed. */
  destroy(id: string): boolean {
    const file = this.files.find((f) => f.id === id);
    if (!file) return false;
    this.destroyFile(file);
    return true;
  }

  /** Check for expired files and clean up. Called on a 60-second interval. */
  checkExpiration(): void {
    const now = new Date();
    let changed = false;

    for (const file of this.files) {
      if (file.status === 'active' && new Date(file.expiresAt) <= now) {
        this.expireFile(file);
        changed = true;
      }
    }

    if (changed) this.saveIndex();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private generateId(timestamp: string): string {
    const data = `${timestamp}:${randomBytes(8).toString('hex')}`;
    return createHmac('sha256', HMAC_KEY).update(data).digest('hex').slice(0, 12);
  }

  private toSummary(file: SecureFile): SecureFileSummary {
    // Encode key as base64url for URL fragment
    const keyBase64 = file.key;
    const keyBase64url = keyBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return {
      id: file.id,
      originalName: file.originalName,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt,
      expiresAt: file.expiresAt,
      status: file.status,
      currentDownloads: file.currentDownloads,
      maxDownloads: file.maxDownloads,
      shareUrl: `https://qshield.io/f/${file.id}#${keyBase64url}`,
    };
  }

  private expireFile(file: SecureFile): void {
    file.status = 'expired';
    file.accessLog.push({
      timestamp: new Date().toISOString(),
      action: 'expired',
      ip: 'system',
      userAgent: 'qshield-desktop',
    });
    this.deleteBlob(file);
    log.info(`[SecureFile] Expired: id=${file.id}`);
  }

  private destroyFile(file: SecureFile): void {
    file.status = 'destroyed';
    file.accessLog.push({
      timestamp: new Date().toISOString(),
      action: 'destroyed',
      ip: 'system',
      userAgent: 'qshield-desktop',
    });
    this.deleteBlob(file);
    this.saveIndex();
    log.info(`[SecureFile] Destroyed: id=${file.id}`);
  }

  private deleteBlob(file: SecureFile): void {
    try {
      if (existsSync(file.encryptedPath)) {
        unlinkSync(file.encryptedPath);
      }
    } catch {
      log.warn(`[SecureFile] Failed to delete blob: ${file.encryptedPath}`);
    }
  }

  private enforceStorageLimit(): void {
    if (this.files.length < MAX_STORED_FILES) return;

    // Delete oldest expired/destroyed files first
    const expired = this.files.filter((f) => f.status !== 'active');
    expired.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const file of expired) {
      if (this.files.length < MAX_STORED_FILES) break;
      this.deleteBlob(file);
      this.files = this.files.filter((f) => f.id !== file.id);
    }

    this.saveIndex();
  }

  private loadIndex(): void {
    const indexPath = join(this.storagePath, INDEX_FILE);
    try {
      if (existsSync(indexPath)) {
        const raw = readFileSync(indexPath, 'utf-8');
        this.files = JSON.parse(raw) as SecureFile[];
        log.info(`[SecureFile] Loaded ${this.files.length} files from index`);
      }
    } catch (err) {
      log.warn('[SecureFile] Failed to load index:', err);
      this.files = [];
    }
  }

  private saveIndex(): void {
    const indexPath = join(this.storagePath, INDEX_FILE);
    try {
      writeFileSync(indexPath, JSON.stringify(this.files, null, 2));
    } catch (err) {
      log.error('[SecureFile] Failed to save index:', err);
    }
  }
}
