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

/** Connection state of the gateway client */
export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

/** Typed error class for gateway API errors */
export class GatewayError extends Error {
  /** HTTP status code (0 for network errors) */
  readonly status: number;
  /** Machine-readable error code */
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.code = code;
  }
}

/** Queued request for offline replay */
interface QueuedRequest {
  method: string;
  path: string;
  body?: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/** Token storage for auth lifecycle */
interface TokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

type StateChangeCallback = (state: ConnectionState) => void;

/**
 * REST client for the QShield Gateway API.
 *
 * Provides a full auth lifecycle with automatic token refresh,
 * offline request queuing with replay on reconnection,
 * exponential backoff retry with jitter, configurable per-request
 * timeouts, typed error responses, and periodic health checking.
 *
 * Emits connection state changes via registered callbacks.
 */
export class GatewayClient {
  private url: string;
  private apiKey: string | undefined;
  private defaultTimeout: number;
  private retryAttempts: number;
  private baseRetryDelay: number;
  private tokenState: TokenState | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private stateListeners: StateChangeCallback[] = [];
  private requestQueue: QueuedRequest[] = [];
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  /** Maximum backoff delay in milliseconds */
  private static readonly MAX_BACKOFF_MS = 30000;
  /** Health check polling interval in milliseconds */
  private static readonly HEALTH_CHECK_INTERVAL = 30000;
  /** Refresh token this many ms before expiry */
  private static readonly TOKEN_REFRESH_BUFFER_MS = 60000;
  /** Maximum queued requests to prevent unbounded growth */
  private static readonly MAX_QUEUE_SIZE = 100;

  /**
   * Create a new GatewayClient.
   * @param config - gateway connection configuration
   */
  constructor(config: GatewayConfig) {
    this.url = config.url.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.defaultTimeout = config.timeout;
    this.retryAttempts = config.retryAttempts;
    this.baseRetryDelay = config.retryDelay;

    log.info(`[GatewayClient] Initialized with URL: ${this.url}`);
  }

  /**
   * Authenticate with the gateway using credentials.
   * Stores access token, refresh token, and expiry, then starts
   * automatic token refresh and health check polling.
   * @param credentials - login credentials (apiKey or username/password)
   * @returns connection result with status and URL
   */
  async login(credentials: { apiKey?: string; username?: string; password?: string }): Promise<{ connected: boolean; url: string }> {
    this.setConnectionState('connecting');

    try {
      const response = await this.rawRequest<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>('POST', '/api/v1/auth/login', credentials, this.defaultTimeout);

      this.tokenState = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        expiresAt: Date.now() + response.expiresIn * 1000,
      };

      this.setConnectionState('connected');
      this.scheduleTokenRefresh();
      this.startHealthCheck();
      this.flushRequestQueue();

      log.info('[GatewayClient] Login successful');
      return { connected: true, url: this.url };
    } catch (err) {
      this.setConnectionState('error');
      log.error('[GatewayClient] Login failed:', err);
      return { connected: false, url: this.url };
    }
  }

  /**
   * Attempt to connect to the gateway and authenticate using apiKey.
   * Alias for login({ apiKey }) for backward compatibility.
   * @param url - gateway URL to connect to
   * @returns connection result
   */
  async connect(url: string): Promise<{ connected: boolean; url: string }> {
    const normalizedUrl = url.replace(/\/+$/, '');
    this.url = normalizedUrl;
    return this.login({ apiKey: this.apiKey });
  }

  /**
   * Refresh the access token using the stored refresh token.
   * Called automatically before token expiry, but can be called manually.
   * @returns true if refresh succeeded
   */
  async refreshToken(): Promise<boolean> {
    if (!this.tokenState?.refreshToken) {
      log.warn('[GatewayClient] No refresh token available');
      return false;
    }

    try {
      const response = await this.rawRequest<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>('POST', '/api/v1/auth/refresh', {
        refreshToken: this.tokenState.refreshToken,
      }, this.defaultTimeout);

      this.tokenState = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        expiresAt: Date.now() + response.expiresIn * 1000,
      };

      this.scheduleTokenRefresh();
      log.info('[GatewayClient] Token refreshed successfully');
      return true;
    } catch (err) {
      log.error('[GatewayClient] Token refresh failed:', err);
      this.setConnectionState('error');
      return false;
    }
  }

  /**
   * Disconnect from the gateway and clear authentication state.
   * Stops health checking and cancels pending token refresh.
   */
  async disconnect(): Promise<void> {
    if (this.connectionState === 'connected' && this.tokenState) {
      try {
        await this.rawRequest('POST', '/api/v1/auth/disconnect', undefined, this.defaultTimeout);
      } catch (err) {
        log.warn('[GatewayClient] Error during disconnect:', err);
      }
    }

    this.stopHealthCheck();
    this.cancelTokenRefresh();
    this.tokenState = null;
    this.setConnectionState('disconnected');
    log.info('[GatewayClient] Disconnected from gateway');
  }

  /**
   * Get the current connection status.
   * @returns connection state, URL, and token expiry info
   */
  getStatus(): { connected: boolean; url: string; state: ConnectionState; lastPing?: string } {
    return {
      connected: this.connectionState === 'connected',
      url: this.url,
      state: this.connectionState,
    };
  }

  /**
   * Register a callback to be notified when connection state changes.
   * @param callback - invoked with new state on each transition
   */
  onStateChange(callback: StateChangeCallback): void {
    this.stateListeners.push(callback);
  }

  /**
   * Fetch the current trust state from the gateway.
   * @returns the current TrustState
   */
  async fetchTrustState(): Promise<TrustState> {
    return this.request<TrustState>('GET', '/api/v1/trust/state');
  }

  /**
   * Submit a trust signal to the gateway for processing.
   * @param signal - the trust signal to submit
   * @returns acknowledgement response
   */
  async submitSignal(signal: TrustSignal): Promise<{ acknowledged: boolean }> {
    return this.request<{ acknowledged: boolean }>('POST', '/api/v1/trust/signals', signal);
  }

  /**
   * Submit an evidence record to the gateway for storage.
   * @param record - the evidence record to store
   * @returns the stored evidence record
   */
  async submitEvidence(record: EvidenceRecord): Promise<EvidenceRecord> {
    return this.request<EvidenceRecord>('POST', '/api/v1/evidence', record);
  }

  /**
   * Fetch the current policy configuration from the gateway.
   * @returns the current PolicyConfig
   */
  async fetchPolicy(): Promise<PolicyConfig> {
    return this.request<PolicyConfig>('GET', '/api/v1/policy');
  }

  /**
   * Update the policy configuration on the gateway.
   * @param config - the new policy configuration
   * @returns the updated PolicyConfig
   */
  async updatePolicy(config: PolicyConfig): Promise<PolicyConfig> {
    return this.request<PolicyConfig>('PUT', '/api/v1/policy', config);
  }

  /**
   * Fetch a paginated list of alerts from the gateway.
   * @param opts - pagination and filtering options
   * @returns paginated alert list
   */
  async fetchAlerts(opts: ListOptions): Promise<ListResult<Alert>> {
    const params = new URLSearchParams({
      page: String(opts.page),
      pageSize: String(opts.pageSize),
    });

    if (opts.sortBy) params.set('sortBy', opts.sortBy);
    if (opts.sortOrder) params.set('sortOrder', opts.sortOrder);
    if (opts.filter) params.set('filter', JSON.stringify(opts.filter));

    return this.request<ListResult<Alert>>('GET', `/api/v1/alerts?${params.toString()}`);
  }

  /**
   * Dismiss an alert by ID.
   * @param id - the alert ID to dismiss
   * @returns the updated alert
   */
  async dismissAlert(id: string): Promise<Alert> {
    return this.request<Alert>('POST', `/api/v1/alerts/${encodeURIComponent(id)}/dismiss`);
  }

  /**
   * High-level request method with offline queuing.
   * When disconnected, queues the request for replay on reconnection.
   * When connected, delegates to the retry-capable rawRequest.
   * @param method - HTTP method
   * @param path - API path
   * @param body - optional request body
   * @param timeout - optional per-request timeout override
   * @returns typed response data
   */
  private async request<T>(method: string, path: string, body?: unknown, timeout?: number): Promise<T> {
    if (this.connectionState === 'disconnected' || this.connectionState === 'error') {
      // Queue write requests for replay; reject reads since stale data is worse than an error
      if (method !== 'GET' && method !== 'HEAD') {
        return new Promise<T>((resolve, reject) => {
          if (this.requestQueue.length >= GatewayClient.MAX_QUEUE_SIZE) {
            reject(new GatewayError('Request queue full', 0, 'QUEUE_FULL'));
            return;
          }
          this.requestQueue.push({
            method,
            path,
            body,
            resolve: resolve as (v: unknown) => void,
            reject,
            timestamp: Date.now(),
          });
          log.debug(`[GatewayClient] Request queued (${this.requestQueue.length} pending): ${method} ${path}`);
        });
      }

      throw new GatewayError('Not connected to gateway', 0, 'DISCONNECTED');
    }

    return this.requestWithRetry<T>(method, path, body, timeout);
  }

  /**
   * Execute a request with exponential backoff retry and jitter.
   * Retries on network errors and 5xx status codes.
   * Backoff: baseDelay * 2^attempt + random jitter, capped at MAX_BACKOFF_MS.
   * @param method - HTTP method
   * @param path - API path
   * @param body - optional request body
   * @param timeout - optional per-request timeout
   * @returns typed response data
   */
  private async requestWithRetry<T>(method: string, path: string, body?: unknown, timeout?: number): Promise<T> {
    let lastError: GatewayError | undefined;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      if (attempt > 0) {
        const baseDelay = this.baseRetryDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * this.baseRetryDelay;
        const backoffDelay = Math.min(baseDelay + jitter, GatewayClient.MAX_BACKOFF_MS);

        log.debug(
          `[GatewayClient] Retry ${attempt}/${this.retryAttempts} after ${Math.round(backoffDelay)}ms`,
        );
        await this.sleep(backoffDelay);
      }

      try {
        return await this.rawRequest<T>(method, path, body, timeout ?? this.defaultTimeout);
      } catch (err) {
        const error = err instanceof GatewayError
          ? err
          : new GatewayError(
              err instanceof Error ? err.message : String(err),
              0,
              'NETWORK_ERROR',
            );

        // Retry on server errors (5xx) and network errors
        if ((error.status >= 500 || error.status === 0) && attempt < this.retryAttempts) {
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    log.error(`[GatewayClient] All ${this.retryAttempts} retries exhausted for ${method} ${path}`);
    this.setConnectionState('error');
    throw lastError ?? new GatewayError('Request failed after all retries', 0, 'RETRIES_EXHAUSTED');
  }

  /**
   * Execute a single HTTP request without retry logic.
   * @param method - HTTP method
   * @param path - API path
   * @param body - optional request body
   * @param timeout - request timeout in ms
   * @returns typed response data
   */
  private async rawRequest<T>(method: string, path: string, body?: unknown, timeout?: number): Promise<T> {
    const controller = new AbortController();
    const effectiveTimeout = timeout ?? this.defaultTimeout;
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (this.tokenState?.accessToken) {
        headers['Authorization'] = `Bearer ${this.tokenState.accessToken}`;
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

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        let errorCode = 'HTTP_ERROR';

        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.code) errorCode = parsed.code;
        } catch {
          // Use default error code
        }

        throw new GatewayError(
          `HTTP ${response.status}: ${errorBody}`,
          response.status,
          errorCode,
        );
      }

      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof GatewayError) throw err;

      const error = err instanceof Error ? err : new Error(String(err));
      if (error.name === 'AbortError') {
        throw new GatewayError(
          `Request timeout after ${effectiveTimeout}ms`,
          0,
          'TIMEOUT',
        );
      }

      throw new GatewayError(error.message, 0, 'NETWORK_ERROR');
    }
  }

  /**
   * Flush the offline request queue by replaying all queued requests.
   * Called automatically on successful reconnection.
   */
  private async flushRequestQueue(): Promise<void> {
    if (this.requestQueue.length === 0) return;

    log.info(`[GatewayClient] Flushing ${this.requestQueue.length} queued requests`);
    const queue = [...this.requestQueue];
    this.requestQueue = [];

    for (const req of queue) {
      try {
        const result = await this.requestWithRetry(req.method, req.path, req.body);
        req.resolve(result);
      } catch (err) {
        req.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Schedule automatic token refresh before expiry.
   * Refreshes TOKEN_REFRESH_BUFFER_MS before the token expires.
   */
  private scheduleTokenRefresh(): void {
    this.cancelTokenRefresh();

    if (!this.tokenState) return;

    const msUntilExpiry = this.tokenState.expiresAt - Date.now();
    const refreshIn = Math.max(0, msUntilExpiry - GatewayClient.TOKEN_REFRESH_BUFFER_MS);

    this.tokenRefreshTimer = setTimeout(async () => {
      const success = await this.refreshToken();
      if (!success) {
        log.warn('[GatewayClient] Auto token refresh failed, attempting login');
      }
    }, refreshIn);

    log.debug(`[GatewayClient] Token refresh scheduled in ${Math.round(refreshIn / 1000)}s`);
  }

  /**
   * Cancel any pending token refresh timer.
   */
  private cancelTokenRefresh(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  /**
   * Start periodic health check polling.
   * Polls /health every 30 seconds to detect connection loss.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.rawRequest('GET', '/api/v1/health', undefined, 5000);
        if (this.connectionState !== 'connected') {
          this.setConnectionState('connected');
          this.flushRequestQueue();
        }
      } catch {
        if (this.connectionState === 'connected') {
          log.warn('[GatewayClient] Health check failed, marking disconnected');
          this.setConnectionState('error');
        }
      }
    }, GatewayClient.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop the periodic health check timer.
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Update the connection state and notify all listeners.
   * @param state - the new connection state
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;

    const previous = this.connectionState;
    this.connectionState = state;
    log.info(`[GatewayClient] State: ${previous} → ${state}`);

    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        log.error('[GatewayClient] Error in state change listener:', err);
      }
    }
  }

  /**
   * Sleep for the specified duration.
   * @param ms - milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
