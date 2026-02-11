import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface EmailEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const EMAIL_EVENTS: EmailEventTemplate[] = [
  {
    eventType: 'email-sent',
    trustImpact: 5,
    dataGenerator: () => ({
      from: 'user@company.com',
      to: pickRandom([
        'colleague@company.com',
        'partner@external.com',
        'client@megacorp.com',
        'unknown@suspicious.xyz',
      ]),
      subject: pickRandom([
        'Re: Project Update',
        'Meeting Follow-up',
        'Q4 Budget Draft',
        'Urgent: Action Required',
        'FYI: Policy Changes',
      ]),
      hasAttachment: Math.random() > 0.6,
      attachmentCount: Math.floor(Math.random() * 3),
      isEncrypted: Math.random() > 0.5,
      recipientCount: Math.floor(Math.random() * 5) + 1,
    }),
  },
  {
    eventType: 'email-received',
    trustImpact: 0,
    dataGenerator: () => ({
      from: pickRandom([
        'colleague@company.com',
        'partner@external.com',
        'noreply@service.com',
        'alerts@monitoring.io',
        'unknown@freemail.com',
      ]),
      to: 'user@company.com',
      subject: pickRandom([
        'Weekly Report',
        'Invoice #12345',
        'You have been selected!',
        'Security Alert',
        'Team Standup Notes',
      ]),
      spamScore: Math.random() * 10,
      isExternal: Math.random() > 0.4,
      hasSPF: Math.random() > 0.2,
      hasDKIM: Math.random() > 0.3,
    }),
  },
  {
    eventType: 'attachment-scanned',
    trustImpact: 10,
    dataGenerator: () => ({
      fileName: pickRandom([
        'report.pdf',
        'data.xlsx',
        'photo.jpg',
        'script.exe',
        'archive.zip',
      ]),
      fileSize: Math.floor(Math.random() * 25000000),
      mimeType: pickRandom([
        'application/pdf',
        'application/vnd.ms-excel',
        'image/jpeg',
        'application/x-executable',
        'application/zip',
      ]),
      scanResult: pickRandom(['clean', 'clean', 'clean', 'suspicious', 'malicious']),
      threatName: Math.random() > 0.8 ? 'Trojan.GenericKD' : undefined,
    }),
  },
  {
    eventType: 'phishing-detected',
    trustImpact: -30,
    dataGenerator: () => ({
      from: pickRandom([
        'ceo@c0mpany.com',
        'support@paypa1.com',
        'admin@micros0ft.com',
        'hr@company-benefits.xyz',
      ]),
      subject: pickRandom([
        'Urgent: Verify Your Account',
        'Password Reset Required',
        'Wire Transfer Needed',
        'Tax Refund Available',
      ]),
      confidence: Math.random() * 0.4 + 0.6, // 0.6 - 1.0
      indicators: pickRandom([
        ['spoofed-domain', 'urgency-language', 'suspicious-link'],
        ['lookalike-domain', 'credential-harvesting'],
        ['ceo-impersonation', 'wire-transfer-request'],
      ]),
      blocked: Math.random() > 0.1,
    }),
  },
  {
    eventType: 'encryption-status',
    trustImpact: 15,
    dataGenerator: () => ({
      protocol: pickRandom(['TLS 1.3', 'TLS 1.2', 'STARTTLS']),
      provider: pickRandom(['Exchange Online', 'Gmail', 'ProtonMail', 'Custom SMTP']),
      certificateValid: Math.random() > 0.05,
      certificateExpiry: new Date(Date.now() + Math.random() * 365 * 86400000).toISOString(),
      perfectForwardSecrecy: Math.random() > 0.3,
    }),
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Email Monitor adapter.
 * Monitors email activity including sent/received messages,
 * attachment scanning, phishing detection, and encryption status.
 */
export class EmailAdapter extends BaseAdapter {
  readonly id: AdapterType = 'email';
  readonly name = 'Email Monitor';

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[EmailAdapter] Configured for email monitoring');
  }

  async start(): Promise<void> {
    await super.start();
    log.info('[EmailAdapter] Monitoring email activity');
  }

  async stop(): Promise<void> {
    await super.stop();
    log.info('[EmailAdapter] Stopped email monitoring');
  }

  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[EmailAdapter] Email adapter destroyed');
  }

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
