import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface EmailEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const INTERNAL_ADDRESSES = [
  'alice@company.com', 'bob@company.com', 'carol@company.com',
  'dave@company.com', 'hr@company.com', 'security@company.com',
];
const EXTERNAL_ADDRESSES = [
  'partner@external.com', 'client@megacorp.com', 'vendor@supplier.io',
  'noreply@service.com', 'alerts@monitoring.io', 'support@saas.com',
];
const SUBJECT_LINES = [
  'Re: Project Update', 'Meeting Follow-up', 'Q4 Budget Draft',
  'Weekly Report', 'Invoice #12345', 'Security Alert',
  'Team Standup Notes', 'FYI: Policy Changes', 'Action Required',
];
const ATTACHMENT_NAMES = [
  'report.pdf', 'data.xlsx', 'photo.jpg', 'presentation.pptx',
  'archive.zip', 'contract.docx', 'invoice.pdf', 'diagram.png',
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const EMAIL_EVENTS: EmailEventTemplate[] = [
  {
    eventType: 'email-sent',
    trustImpact: 5,
    dataGenerator: () => ({
      from: 'user@company.com',
      to: pickRandom([...INTERNAL_ADDRESSES, ...EXTERNAL_ADDRESSES]),
      subject: pickRandom(SUBJECT_LINES),
      hasAttachment: Math.random() > 0.6,
      attachmentCount: Math.floor(Math.random() * 3),
      attachmentNames: [pickRandom(ATTACHMENT_NAMES)],
      isEncrypted: Math.random() > 0.5,
      recipientCount: Math.floor(Math.random() * 5) + 1,
      bodySize: Math.floor(Math.random() * 50000) + 100,
    }),
  },
  {
    eventType: 'email-received',
    trustImpact: 0,
    dataGenerator: () => ({
      from: pickRandom([...INTERNAL_ADDRESSES, ...EXTERNAL_ADDRESSES]),
      to: 'user@company.com',
      subject: pickRandom(SUBJECT_LINES),
      isExternal: Math.random() > 0.4,
      hasAttachment: Math.random() > 0.5,
      spamScore: Math.round(Math.random() * 100) / 10,
      bodySize: Math.floor(Math.random() * 100000) + 100,
      headers: {
        'X-Mailer': pickRandom(['Outlook 16.0', 'Thunderbird 115', 'Gmail', 'Apple Mail']),
      },
    }),
  },
  {
    eventType: 'attachment-downloaded',
    trustImpact: -10,
    dataGenerator: () => ({
      fileName: pickRandom(ATTACHMENT_NAMES),
      fileSize: Math.floor(Math.random() * 25000000),
      mimeType: pickRandom([
        'application/pdf', 'application/vnd.ms-excel',
        'image/jpeg', 'application/zip', 'application/msword',
      ]),
      downloadedBy: 'user@company.com',
      sourceEmail: pickRandom(EXTERNAL_ADDRESSES),
      scanResult: pickRandom(['clean', 'clean', 'clean', 'suspicious', 'malicious']),
      sha256: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    }),
  },
  {
    eventType: 'link-clicked',
    trustImpact: -8,
    dataGenerator: () => ({
      domain: pickRandom([
        'docs.google.com', 'github.com', 'suspicious-site.xyz',
        'dropbox.com', 'onedrive.live.com', 'bit.ly',
      ]),
      isKnownDomain: Math.random() > 0.3,
      emailFrom: pickRandom([...INTERNAL_ADDRESSES, ...EXTERNAL_ADDRESSES]),
      emailSubject: pickRandom(SUBJECT_LINES),
      isShortenedUrl: Math.random() > 0.7,
      redirectCount: Math.floor(Math.random() * 3),
    }),
  },
  {
    eventType: 'spf-pass',
    trustImpact: 15,
    dataGenerator: () => ({
      domain: pickRandom(['company.com', 'megacorp.com', 'external.com', 'supplier.io']),
      senderIp: `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      result: 'pass',
      mechanism: pickRandom(['ip4', 'include', 'a', 'mx']),
      lookupCount: Math.floor(Math.random() * 5) + 1,
    }),
  },
  {
    eventType: 'spf-fail',
    trustImpact: -25,
    dataGenerator: () => ({
      domain: pickRandom(['company.com', 'suspicious.xyz', 'freemail.com']),
      senderIp: `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      result: pickRandom(['fail', 'softfail', 'permerror']),
      explanation: pickRandom([
        'IP not in SPF record', 'DNS lookup failed',
        'Too many DNS lookups', 'Sender domain mismatch',
      ]),
    }),
  },
  {
    eventType: 'dkim-verified',
    trustImpact: 15,
    dataGenerator: () => ({
      domain: pickRandom(['company.com', 'megacorp.com', 'external.com']),
      selector: pickRandom(['default', 'google', 's1', 'k1']),
      algorithm: pickRandom(['rsa-sha256', 'ed25519-sha256']),
      keySize: pickRandom([1024, 2048, 4096]),
      result: 'pass',
      headerFields: pickRandom([
        ['from', 'to', 'subject', 'date'],
        ['from', 'to', 'subject', 'date', 'message-id'],
      ]),
    }),
  },
];

/**
 * Email Monitor adapter.
 * Monitors email activity including sent/received messages, attachment
 * downloads, link clicks, SPF validation, and DKIM verification.
 * Produces simulated events at a configurable interval (default 30 seconds).
 */
export class EmailAdapter extends BaseAdapter {
  readonly id: AdapterType = 'email';
  readonly name = 'Email Monitor';
  protected override defaultInterval = 30000;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  /**
   * Initialize the Email adapter with optional configuration.
   * @param config - may include pollInterval override
   */
  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[EmailAdapter] Configured for email monitoring');
  }

  /**
   * Start monitoring email activity.
   */
  async start(): Promise<void> {
    await super.start();
    log.info('[EmailAdapter] Monitoring email activity');
  }

  /**
   * Stop monitoring email activity.
   */
  async stop(): Promise<void> {
    await super.stop();
    log.info('[EmailAdapter] Stopped email monitoring');
  }

  /**
   * Destroy the Email adapter and release all resources.
   */
  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[EmailAdapter] Email adapter destroyed');
  }

  /**
   * Generate a simulated email event with realistic metadata.
   * @returns an AdapterEvent representing email activity
   */
  protected generateSimulatedEvent(): AdapterEvent {
    const template = pickRandom(EMAIL_EVENTS);
    return {
      adapterId: this.id,
      eventType: template.eventType,
      timestamp: new Date().toISOString(),
      data: template.dataGenerator(),
      trustImpact: template.trustImpact,
    };
  }
}
