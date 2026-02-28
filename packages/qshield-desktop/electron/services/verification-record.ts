import { createHmac, randomBytes } from 'node:crypto';
import log from 'electron-log';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VerificationRecord {
  verificationId: string;
  senderName: string;
  senderEmail: string;
  timestamp: string;
  trustScore: number;
  trustLevel: string;
  emailSubjectHash: string;
  evidenceChainHash: string;
  referralId: string;
  clicked: boolean;
  clickCount: number;
}

export interface VerificationStats {
  totalGenerated: number;
  totalClicks: number;
  clickThroughRate: number;
  recentVerifications: VerificationRecord[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_GATEWAY_URL = 'https://api.qshield.app';

// ── Service ──────────────────────────────────────────────────────────────────

export class VerificationRecordService {
  private records: VerificationRecord[] = [];
  private referralId: string;
  private hmacKey: string;
  private gatewayBaseUrl: string;
  private verifyBaseUrl: string;

  constructor(hmacKey?: string, gatewayUrl?: string) {
    if (!hmacKey) {
      throw new Error('VerificationRecordService requires an HMAC key — pass one from KeyManager');
    }
    this.hmacKey = hmacKey;
    this.gatewayBaseUrl = (gatewayUrl || DEFAULT_GATEWAY_URL).replace(/\/+$/, '');
    this.verifyBaseUrl = `${this.gatewayBaseUrl}/v`;
    // Generate a stable referral ID (in production this would be persisted)
    this.referralId = randomBytes(8).toString('hex');
  }

  /**
   * Create a new verification record when generating a signature.
   * Returns the verification ID and URL.
   */
  createRecord(opts: {
    senderName: string;
    senderEmail: string;
    trustScore: number;
    trustLevel: string;
    emailSubject?: string;
  }): { verificationId: string; verifyUrl: string; referralId: string } {
    const timestamp = new Date().toISOString();
    const verificationId = this.generateVerificationId(timestamp, opts.trustScore, opts.senderEmail);
    const emailSubjectHash = opts.emailSubject
      ? createHmac('sha256', this.hmacKey).update(opts.emailSubject).digest('hex').slice(0, 16)
      : 'none';
    const evidenceChainHash = createHmac('sha256', this.hmacKey)
      .update(`${timestamp}:${opts.trustScore}:${opts.senderEmail}:${verificationId}`)
      .digest('hex');

    const record: VerificationRecord = {
      verificationId,
      senderName: opts.senderName,
      senderEmail: opts.senderEmail,
      timestamp,
      trustScore: opts.trustScore,
      trustLevel: opts.trustLevel,
      emailSubjectHash,
      evidenceChainHash,
      referralId: this.referralId,
      clicked: false,
      clickCount: 0,
    };

    this.records.unshift(record);
    // Keep last 500 records
    if (this.records.length > 500) this.records.length = 500;

    log.info(`[VerificationRecord] Created: ${verificationId} (score: ${opts.trustScore})`);

    // Fire-and-forget POST to gateway (non-blocking)
    this.registerWithGateway(record).catch(() => {});

    return {
      verificationId,
      verifyUrl: `${this.verifyBaseUrl}/${verificationId}`,
      referralId: this.referralId,
    };
  }

  /** Get a record by verification ID */
  getRecord(id: string): VerificationRecord | undefined {
    return this.records.find((r) => r.verificationId === id);
  }

  /** Record a click on a verification link */
  recordClick(verificationId: string): void {
    const record = this.records.find((r) => r.verificationId === verificationId);
    if (record) {
      record.clicked = true;
      record.clickCount++;
    }
  }

  /** Get analytics stats */
  getStats(): VerificationStats {
    const totalGenerated = this.records.length;
    const totalClicks = this.records.reduce((sum, r) => sum + r.clickCount, 0);
    const clickThroughRate = totalGenerated > 0 ? (this.records.filter((r) => r.clicked).length / totalGenerated) * 100 : 0;

    return {
      totalGenerated,
      totalClicks,
      clickThroughRate: Math.round(clickThroughRate * 10) / 10,
      recentVerifications: this.records.slice(0, 10),
    };
  }

  /** Get the referral ID for this sender */
  getReferralId(): string {
    return this.referralId;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private generateVerificationId(timestamp: string, score: number, email: string): string {
    const data = `${timestamp}:${score}:${email}:${randomBytes(4).toString('hex')}`;
    return createHmac('sha256', this.hmacKey).update(data).digest('hex').slice(0, 12);
  }

  /** POST verification record to Gateway (best-effort, fire-and-forget) */
  private async registerWithGateway(record: VerificationRecord): Promise<void> {
    const url = `${this.gatewayBaseUrl}/api/v1/verification`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verificationId: record.verificationId,
        senderName: record.senderName,
        senderEmail: record.senderEmail,
        trustScore: record.trustScore,
        trustLevel: record.trustLevel,
        emailSubjectHash: record.emailSubjectHash,
        evidenceChainHash: record.evidenceChainHash,
        referralId: record.referralId,
      }),
    });
    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }
    log.info(`[VerificationRecord] Registered with gateway: ${record.verificationId}`);
  }
}
