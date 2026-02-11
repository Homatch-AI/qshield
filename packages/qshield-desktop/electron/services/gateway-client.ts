import log from 'electron-log';
import type {
  TrustState,
  TrustSignal,
  GatewayConfig,
  EvidenceRecord,
  PolicyConfig,
  Alert,
  ListOptions,
  ListResult,
} from '@qshield/core';

/**
 * REST client for the QShield Gateway API.
 * Provides methods for trust state management, signal submission,
 * evidence recording, policy configuration, and alert handling.
 * Implements exponential backoff retry logic and graceful fallback
 * when the gateway is unreachable.
 */
export class GatewayClient {
  private url: string;
  private apiKey: string | undefined;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;
  private connected = false;
  private authToken: string | null = null;
  private lastPing: string | undefined;

  constructor(config: GatewayConfig) {
    this.url = config.url.replace(/\/+$/, ''); // strip trailing slashes
    this.apiKey = config.apiKey;
    this.timeout = config.timeout;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;

    log.info(`[GatewayClient] Initialized with URL: ${this.url}`);
  }

  /**
   * Attempt to connect to the gateway and authenticate.
   * Returns connection status and the resolved URL.
   */
  async connect(url: string): Promise<{ connected: boolean; url: string }> {
    const normalizedUrl = url.replace(/\/+$/, '');
    this.url = normalizedUrl;

    try {
      log.info(`[GatewayClient] Connecting to ${normalizedUrl}...`);

      const response = await this.request<{ token: string; expiresAt: string }>(
        'POST',
        '/api/v1/auth/connect',
        { apiKey: this.apiKey },
      );

      this.authToken = response.token;
      this.connected = true;
      this.lastPing = new Date().toISOString();

      log.info(`[GatewayClient] Connected to gateway at ${normalizedUrl}`);
      return { connected: true, url: normalizedUrl };
    } catch (err) {
      log.warn(`[GatewayClient] Failed to connect to ${normalizedUrl}:`, err);
      this.connected = false;
      this.authToken = null;
      return { connected: false, url: normalizedUrl };
    }
  }

  /**
   * Disconnect from the gateway and clear authentication state.
   */
  async disconnect(): Promise<void> {
    if (this.connected && this.authToken) {
      try {
        await this.request('POST', '/api/v1/auth/disconnect');
      } catch (err) {
        log.warn('[GatewayClient] Error during disconnect:', err);
      }
    }

    this.connected = false;
    this.authToken = null;
    this.lastPing = undefined;
    log.info('[GatewayClient] Disconnected from gateway');
  }

  /**
   * Get the current connection status.
   */
  getStatus(): { connected: boolean; url: string; lastPing?: string } {
    return {
      connected: this.connected,
      url: this.url,
      lastPing: this.lastPing,
    };
  }

  /**
   * Fetch the current trust state from the gateway.
   */
  async fetchTrustState(): Promise<TrustState> {
    return this.request<TrustState>('GET', '/api/v1/trust/state');
  }

  /**
   * Submit a trust signal to the gateway for processing.
   */
  async submitSignal(signal: TrustSignal): Promise<{ acknowledged: boolean }> {
    return this.request<{ acknowledged: boolean }>('POST', '/api/v1/trust/signals', signal);
  }

  /**
   * Submit an evidence record to the gateway for storage.
   */
  async submitEvidence(record: EvidenceRecord): Promise<EvidenceRecord> {
    return this.request<EvidenceRecord>('POST', '/api/v1/evidence', record);
  }

  /**
   * Fetch the current policy configuration from the gateway.
   */
  async fetchPolicy(): Promise<PolicyConfig> {
    return this.request<PolicyConfig>('GET', '/api/v1/policy');
  }

  /**
   * Update the policy configuration on the gateway.
   */
  async updatePolicy(config: PolicyConfig): Promise<PolicyConfig> {
    return this.request<PolicyConfig>('PUT', '/api/v1/policy', config);
  }

  /**
   * Fetch a paginated list of alerts from the gateway.
   */
  async fetchAlerts(opts: ListOptions): Promise<ListResult<Alert>> {
    const params = new URLSearchParams({
      page: String(opts.page),
      pageSize: String(opts.pageSize),
    });

    if (opts.sortBy) {
      params.set('sortBy', opts.sortBy);
    }
    if (opts.sortOrder) {
      params.set('sortOrder', opts.sortOrder);
    }
    if (opts.filter) {
      params.set('filter', JSON.stringify(opts.filter));
    }

    return this.request<ListResult<Alert>>('GET', `/api/v1/alerts?${params.toString()}`);
  }

  /**
   * Dismiss an alert by ID.
   */
  async dismissAlert(id: string): Promise<Alert> {
    return this.request<Alert>('POST', `/api/v1/alerts/${encodeURIComponent(id)}/dismiss`);
  }

  /**
   * Base HTTP request method with exponential backoff retry logic.
   * Retries on network errors and 5xx status codes.
   * Backoff pattern: 1s, 2s, 4s (base * 2^attempt).
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      if (attempt > 0) {
        const backoffDelay = this.retryDelay * Math.pow(2, attempt - 1);
        log.debug(
          `[GatewayClient] Retry attempt ${attempt}/${this.retryAttempts} after ${backoffDelay}ms`,
        );
        await this.sleep(backoffDelay);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };

        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`;
        } else if (this.apiKey) {
          headers['X-API-Key'] = this.apiKey;
        }

        const requestInit: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
          requestInit.body = JSON.stringify(body);
        }

        const fullUrl = `${this.url}${path}`;
        log.debug(`[GatewayClient] ${method} ${fullUrl}`);

        const response = await fetch(fullUrl, requestInit);
        clearTimeout(timeoutId);

        this.lastPing = new Date().toISOString();

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'Unknown error');

          // Retry on server errors (5xx)
          if (response.status >= 500 && attempt < this.retryAttempts) {
            log.warn(
              `[GatewayClient] Server error ${response.status} on ${method} ${path}: ${errorBody}`,
            );
            lastError = new Error(`HTTP ${response.status}: ${errorBody}`);
            continue;
          }

          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        // Handle empty responses (204 No Content)
        const contentLength = response.headers.get('content-length');
        if (response.status === 204 || contentLength === '0') {
          return {} as T;
        }

        const data = (await response.json()) as T;
        return data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Don't retry on abort (timeout) or non-retryable errors
        if (error.name === 'AbortError') {
          log.warn(`[GatewayClient] Request timeout on ${method} ${path}`);
          lastError = new Error(`Request timeout after ${this.timeout}ms`);
        } else if (attempt < this.retryAttempts) {
          log.warn(`[GatewayClient] Request failed on ${method} ${path}:`, error.message);
          lastError = error;
          continue;
        } else {
          lastError = error;
        }
      }
    }

    // All retries exhausted
    log.error(
      `[GatewayClient] All ${this.retryAttempts} retries exhausted for ${method} ${path}`,
    );
    this.connected = false;
    throw lastError ?? new Error('Request failed after all retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
