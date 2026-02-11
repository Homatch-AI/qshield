import log from 'electron-log';

type MessageCallback = (data: unknown) => void;
type ConnectionCallback = (connected: boolean) => void;

/**
 * WebSocket client with automatic reconnection and heartbeat.
 * Connects to the QShield Gateway WebSocket endpoint for real-time
 * event streaming. Features exponential backoff reconnection with
 * a maximum delay of 30 seconds and a 30-second heartbeat interval.
 */
export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private messageListeners: MessageCallback[] = [];
  private connectionListeners: ConnectionCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private intentionalDisconnect = false;
  private _isConnected = false;

  /** Maximum reconnection delay in milliseconds */
  private static readonly MAX_RECONNECT_DELAY = 30000;

  /** Base reconnection delay in milliseconds */
  private static readonly BASE_RECONNECT_DELAY = 1000;

  /** Heartbeat interval in milliseconds */
  private static readonly HEARTBEAT_INTERVAL = 30000;

  constructor(url: string) {
    // Ensure the URL uses ws:// or wss:// protocol
    this.url = url.replace(/^http/, 'ws').replace(/\/+$/, '');
    log.info(`[WebSocketClient] Initialized with URL: ${this.url}`);
  }

  /**
   * Whether the WebSocket connection is currently active.
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Establish a WebSocket connection to the /ws/events endpoint.
   * Automatically sets up reconnection and heartbeat.
   */
  connect(): void {
    this.intentionalDisconnect = false;
    this.doConnect();
  }

  /**
   * Gracefully disconnect the WebSocket and stop reconnection attempts.
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cleanup();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch (err) {
        log.warn('[WebSocketClient] Error closing WebSocket:', err);
      }
      this.ws = null;
    }

    this.setConnected(false);
    this.reconnectAttempts = 0;
    log.info('[WebSocketClient] Disconnected');
  }

  /**
   * Register a callback to be invoked when a message is received.
   * The data parameter will be the parsed JSON payload.
   */
  onMessage(callback: MessageCallback): void {
    this.messageListeners.push(callback);
  }

  /**
   * Register a callback to be invoked when the connection state changes.
   */
  onConnectionChange(callback: ConnectionCallback): void {
    this.connectionListeners.push(callback);
  }

  /**
   * Internal: perform the actual WebSocket connection.
   */
  private doConnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors on stale connections
      }
      this.ws = null;
    }

    const wsUrl = `${this.url}/ws/events`;
    log.info(`[WebSocketClient] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      log.error('[WebSocketClient] Failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      log.info('[WebSocketClient] Connection established');
      this.reconnectAttempts = 0;
      this.setConnected(true);
      this.startHeartbeat();
    };

    this.ws.onclose = (event) => {
      log.info(
        `[WebSocketClient] Connection closed (code: ${event.code}, reason: ${event.reason || 'none'})`,
      );
      this.setConnected(false);
      this.stopHeartbeat();

      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      log.error('[WebSocketClient] Connection error:', event);
      // onclose will fire after onerror, so reconnection is handled there
    };

    this.ws.onmessage = (event) => {
      try {
        const data: unknown = JSON.parse(String(event.data));
        log.debug('[WebSocketClient] Message received');

        for (const listener of this.messageListeners) {
          try {
            listener(data);
          } catch (err) {
            log.error('[WebSocketClient] Error in message listener:', err);
          }
        }
      } catch (err) {
        log.warn('[WebSocketClient] Failed to parse message:', err);
      }
    };
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Delay doubles with each attempt, capped at MAX_RECONNECT_DELAY.
   */
  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(
      WebSocketClient.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      WebSocketClient.MAX_RECONNECT_DELAY,
    );

    this.reconnectAttempts++;
    log.info(
      `[WebSocketClient] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect) {
        this.doConnect();
      }
    }, delay);
  }

  /**
   * Start sending heartbeat/ping messages at a regular interval.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          log.debug('[WebSocketClient] Heartbeat sent');
        } catch (err) {
          log.warn('[WebSocketClient] Failed to send heartbeat:', err);
        }
      }
    }, WebSocketClient.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop the heartbeat interval.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Update connection state and notify listeners.
   */
  private setConnected(connected: boolean): void {
    if (this._isConnected !== connected) {
      this._isConnected = connected;
      for (const listener of this.connectionListeners) {
        try {
          listener(connected);
        } catch (err) {
          log.error('[WebSocketClient] Error in connection listener:', err);
        }
      }
    }
  }

  /**
   * Clean up timers and resources.
   */
  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
