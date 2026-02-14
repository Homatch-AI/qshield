import type { QShieldConfig, SignResponse, HealthResponse, StatusResponse } from './types';

export class QShieldApiClient {
  private baseUrl: string;
  private token: string;

  constructor(config: QShieldConfig) {
    this.baseUrl = `http://127.0.0.1:${config.apiPort}`;
    this.token = config.apiToken;
  }

  /** Update connection settings without creating a new instance. */
  updateConfig(config: Partial<QShieldConfig>): void {
    if (config.apiPort !== undefined) {
      this.baseUrl = `http://127.0.0.1:${config.apiPort}`;
    }
    if (config.apiToken !== undefined) {
      this.token = config.apiToken;
    }
  }

  /** Health check — no auth required. */
  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/health`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  }

  /** Sign an email and get the verification badge HTML. */
  async signEmail(params: {
    contentHash: string;
    subject?: string;
    recipients: string[];
    timestamp: string;
    platform: string;
  }): Promise<SignResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/email/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-QShield-Token': this.token,
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Sign failed: ${res.status}`);
    }
    return res.json();
  }

  /** Get current extension status (edition, daily limits, etc). */
  async status(): Promise<StatusResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/email/status`, {
      method: 'GET',
      headers: { 'X-QShield-Token': this.token },
    });
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    return res.json();
  }

  /** Record a verification link click. */
  async recordClick(verificationId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/email/verify-click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-QShield-Token': this.token,
      },
      body: JSON.stringify({ verificationId }),
    });
    if (!res.ok) throw new Error(`Record click failed: ${res.status}`);
  }
}
