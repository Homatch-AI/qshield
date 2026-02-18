/**
 * Email notification service using the Resend API.
 * Sends alerts for asset changes, score drops, SPF/DKIM failures, and daily summaries.
 * Respects quiet hours, rate limiting, and per-event toggles.
 */
import { net } from 'electron';
import log from 'electron-log';
import type { ConfigManager, EmailNotificationConfig } from './config';

// Resend free tier requires onboarding@resend.dev until a custom domain is verified
const DEFAULT_FROM = 'QShield <onboarding@resend.dev>';
const RESEND_API_URL = 'https://api.resend.com/emails';

export class EmailNotifierService {
  private configManager: ConfigManager;
  private sendTimestamps: number[] = [];

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    const hasKey = !!(process.env.QSHIELD_RESEND_API_KEY);
    log.info(`[EmailNotifier] Initialized (env API key: ${hasKey ? 'SET' : 'NOT SET'})`);
  }

  getConfig(): EmailNotificationConfig {
    return this.configManager.get('emailNotifications') as EmailNotificationConfig;
  }

  setConfig(partial: Partial<EmailNotificationConfig>): void {
    const current = this.getConfig();
    const merged = { ...current, ...partial };
    // Deep merge events if provided
    if (partial.events) {
      merged.events = { ...current.events, ...partial.events };
    }
    this.configManager.set('emailNotifications', merged);
    log.info('[EmailNotifier] Config updated');
  }

  async sendTest(): Promise<{ sent: boolean; error?: string }> {
    const config = this.getConfig();
    if (!config.recipientEmail) {
      return { sent: false, error: 'No recipient email configured' };
    }

    const html = this.buildHtml(
      'Test Notification',
      `
      <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
        This is a test email from QShield Desktop. If you received this,
        your email notifications are configured correctly.
      </p>
      <div style="margin-top: 16px; padding: 12px 16px; background: #0f172a; border-radius: 8px; border: 1px solid #334155;">
        <p style="color: #38bdf8; font-size: 13px; margin: 0;">
          Recipient: ${config.recipientEmail}
        </p>
      </div>
      `,
    );

    const sent = await this.sendEmail('QShield Test Notification', html, true);
    if (sent) {
      return { sent: true };
    }
    return { sent: false, error: 'Failed to send email. Check your API key and try again.' };
  }

  async notifyAssetChange(asset: { name: string; path: string; event: string }): Promise<void> {
    const config = this.getConfig();
    if (!config.enabled || !config.events.assetChanges) return;

    const html = this.buildHtml(
      'High-Trust Asset Changed',
      `
      <p style="color: #f59e0b; font-size: 14px; font-weight: 600;">A monitored asset has changed</p>
      <div style="margin-top: 12px; padding: 12px 16px; background: #0f172a; border-radius: 8px; border: 1px solid #334155;">
        <p style="color: #e2e8f0; font-size: 13px; margin: 0 0 4px 0;"><strong>Asset:</strong> ${this.escapeHtml(asset.name)}</p>
        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px 0;"><strong>Path:</strong> ${this.escapeHtml(asset.path)}</p>
        <p style="color: #94a3b8; font-size: 12px; margin: 0;"><strong>Event:</strong> ${this.escapeHtml(asset.event)}</p>
      </div>
      `,
    );

    await this.sendEmail('QShield Alert: High-Trust Asset Changed', html);
  }

  async notifyScoreDrop(score: number, previousScore: number): Promise<void> {
    const config = this.getConfig();
    if (!config.enabled || !config.events.scoreDrops) return;
    if (score >= config.scoreThreshold) return;

    const html = this.buildHtml(
      'Trust Score Drop',
      `
      <p style="color: #ef4444; font-size: 14px; font-weight: 600;">Your trust score has dropped below the threshold</p>
      <div style="margin-top: 12px; padding: 12px 16px; background: #0f172a; border-radius: 8px; border: 1px solid #334155;">
        <p style="color: #e2e8f0; font-size: 13px; margin: 0 0 4px 0;">
          <strong>Current Score:</strong> <span style="color: #ef4444;">${score}</span>
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px 0;">
          <strong>Previous Score:</strong> ${previousScore}
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          <strong>Threshold:</strong> ${config.scoreThreshold}
        </p>
      </div>
      `,
    );

    await this.sendEmail('QShield Alert: Trust Score Drop', html);
  }

  async notifySpfDkimFailure(details: { email: string; failure: string }): Promise<void> {
    const config = this.getConfig();
    if (!config.enabled || !config.events.spfDkimFailures) return;

    const html = this.buildHtml(
      'SPF/DKIM Failure Detected',
      `
      <p style="color: #f59e0b; font-size: 14px; font-weight: 600;">Email authentication failure detected</p>
      <div style="margin-top: 12px; padding: 12px 16px; background: #0f172a; border-radius: 8px; border: 1px solid #334155;">
        <p style="color: #e2e8f0; font-size: 13px; margin: 0 0 4px 0;">
          <strong>Email:</strong> ${this.escapeHtml(details.email)}
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          <strong>Failure:</strong> ${this.escapeHtml(details.failure)}
        </p>
      </div>
      `,
    );

    await this.sendEmail('QShield Alert: SPF/DKIM Failure', html);
  }

  async sendDailySummary(stats: { score: number; grade: string; events: number; anomalies: number }): Promise<void> {
    const config = this.getConfig();
    if (!config.enabled || !config.events.dailySummary) return;

    const gradeColor = stats.grade.startsWith('A') ? '#10b981' : stats.grade.startsWith('B') ? '#38bdf8' : stats.grade.startsWith('C') ? '#f59e0b' : '#ef4444';

    const html = this.buildHtml(
      'Daily Trust Summary',
      `
      <div style="text-align: center; margin-bottom: 16px;">
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 8px 0;">Today's Trust Score</p>
        <p style="font-size: 48px; font-weight: 700; color: #e2e8f0; margin: 0;">${stats.score}</p>
        <p style="font-size: 20px; font-weight: 600; color: ${gradeColor}; margin: 4px 0 0 0;">${stats.grade}</p>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <div style="flex: 1; padding: 12px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">Events</p>
          <p style="color: #e2e8f0; font-size: 18px; font-weight: 600; margin: 4px 0 0 0;">${stats.events}</p>
        </div>
        <div style="flex: 1; padding: 12px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">Anomalies</p>
          <p style="color: ${stats.anomalies > 0 ? '#f59e0b' : '#10b981'}; font-size: 18px; font-weight: 600; margin: 4px 0 0 0;">${stats.anomalies}</p>
        </div>
      </div>
      `,
    );

    await this.sendEmail('QShield Daily Trust Summary', html);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async sendEmail(subject: string, html: string, bypassChecks = false): Promise<boolean> {
    const config = this.getConfig();

    log.info('[EmailNotifier] Attempting send:', {
      recipient: config.recipientEmail || 'NONE',
      hasConfigKey: !!config.resendApiKey,
      hasEnvKey: !!process.env.QSHIELD_RESEND_API_KEY,
      bypassChecks,
    });

    if (!config.recipientEmail) {
      log.warn('[EmailNotifier] No recipient email configured');
      return false;
    }

    if (!bypassChecks) {
      if (this.isWithinQuietHours()) {
        log.debug('[EmailNotifier] Suppressed — within quiet hours');
        return false;
      }
      if (!this.checkRateLimit()) {
        log.debug('[EmailNotifier] Suppressed — rate limit exceeded');
        return false;
      }
    }

    const apiKey = config.resendApiKey || process.env.QSHIELD_RESEND_API_KEY || '';
    if (!apiKey) {
      log.warn('[EmailNotifier] No Resend API key configured (check Settings > Advanced or QSHIELD_RESEND_API_KEY env var)');
      return false;
    }

    log.info(`[EmailNotifier] Using API key: ${apiKey.slice(0, 6)}...`);

    try {
      const res = await net.fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: DEFAULT_FROM,
          to: [config.recipientEmail],
          subject,
          html,
        }),
      });

      const responseText = await res.text();
      log.info(`[EmailNotifier] Resend response: ${res.status} ${responseText}`);

      if (res.ok) {
        this.sendTimestamps.push(Date.now());
        log.info(`[EmailNotifier] Email sent successfully: ${subject}`);
        return true;
      }

      log.error(`[EmailNotifier] Resend API error (${res.status}): ${responseText}`);
      return false;
    } catch (err) {
      log.error('[EmailNotifier] Failed to send email:', err);
      return false;
    }
  }

  private isWithinQuietHours(): boolean {
    const config = this.getConfig();
    const hour = new Date().getHours();
    const { quietHoursStart, quietHoursEnd } = config;

    if (quietHoursStart === quietHoursEnd) return false;

    // Handle midnight wrap (e.g., 22:00 to 07:00)
    if (quietHoursStart > quietHoursEnd) {
      return hour >= quietHoursStart || hour < quietHoursEnd;
    }
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }

  private checkRateLimit(): boolean {
    const config = this.getConfig();
    const now = Date.now();
    const oneHourAgo = now - 3_600_000;
    this.sendTimestamps = this.sendTimestamps.filter((t) => t > oneHourAgo);
    return this.sendTimestamps.length < config.rateLimit;
  }

  private buildHtml(title: string, body: string): string {
    const timestamp = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 0; background: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 520px; margin: 0 auto; padding: 32px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; background: #1e293b; border-radius: 12px; padding: 12px 20px; border: 1px solid #334155;">
        <span style="font-size: 16px; font-weight: 700; color: #38bdf8; letter-spacing: -0.5px;">QShield</span>
      </div>
    </div>

    <!-- Content card -->
    <div style="background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 24px; margin-bottom: 16px;">
      <h1 style="color: #e2e8f0; font-size: 18px; font-weight: 600; margin: 0 0 16px 0;">${title}</h1>
      ${body}
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding-top: 8px;">
      <p style="color: #475569; font-size: 11px; margin: 0;">
        Sent by QShield Desktop &middot; ${timestamp}
      </p>
    </div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
