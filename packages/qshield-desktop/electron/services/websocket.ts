import log from 'electron-log';
import type { TrustSignal, AdapterType } from '@qshield/core';

/** WebSocket connection state machine states */
export type WsConnectionState = 'disconnected' | 'connecting' | 'connected';

/** Events emitted by the WebSocket service */
export type WsEventType = 'signal' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

type SignalCallback = (signal: TrustSignal) => void;
type EventCallback = (event: WsEventType, data?: unknown) => void;

/**
 * Production WebSocket client for real-time trust signal streaming.
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s to 30s max), reset on success
 * - Heartbeat: ping every 30s, expect pong within 10s, reconnect if missing
 * - Typed TrustSignal deserialization with validation
 * - State machine: disconnected → connecting → connected → disconnected
 * - REST polling fallback after 3 consecutive WebSocket failures
 * - Outgoing message queue buffered during disconnection, flushed on reconnect
 * - Event emitter for signal, connected, disconnected, error, reconnecting
 */
export class WebSocketService {
  private url: string;
  private ws: WebSocket | null = null;
  private state: WsConnectionState = 'disconnected';
  private signalListeners: SignalCallback[] = [];
  private eventListeners: EventCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private consecutiveFailures = 0;
  private intentionalDisconnect = false;
  private outgoingQueue: string[] = [];
  private usingFallbackPolling = false;

  /** Maximum reconnection delay in milliseconds */
  private static readonly MAX_RECONNECT_DELAY = 30000;
  /** Base reconnection delay in milliseconds */
  private static readonly BASE_RECONNECT_DELAY = 1000;
  /** Heartbeat ping interval in milliseconds */
  private static readonly HEARTBEAT_INTERVAL = 30000;
  /** Pong response timeout in milliseconds */
  private static readonly PONG_TIMEOUT = 10000;
  /** Number of consecutive failures before switching to REST polling */
  private static readonly FALLBACK_THRESHOLD = 3;
  /** REST polling interval in milliseconds */
  private static readonly POLLING_INTERVAL = 5000;
  /** Maximum outgoing queue size */
  private static readonly MAX_QUEUE_SIZE = 100;

  /**
   * Create a new WebSocketService.
   * @param url - gateway URL (http/https will be converted to ws/wss)
   */
  constructor(url: string) {
    this.url = url.replace(/^http/, 'ws').replace(/\/+$/, '');
    log.info(`[WebSocketService] Initialized with URL: ${this.url}`);
  }

  /**
   * Whether the WebSocket connection is currently active.
   */
  get isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Get the current connection state.
   * @returns the connection state string
   */
  getState(): WsConnectionState {
    return this.state;
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
   * Gracefully disconnect the WebSocket and stop all reconnection,
   * heartbeat, and fallback polling.
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cleanup();
    this.stopFallbackPolling();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch (err) {
        log.warn('[WebSocketService] Error closing WebSocket:', err);
      }
      this.ws = null;
    }

    this.setState('disconnected');
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
    log.info('[WebSocketService] Disconnected');
  }

  /**
   * Send a message through the WebSocket connection.
   * If disconnected, the message is buffered and sent on reconnection.
   * @param data - object to serialize and send
   */
  send(data: unknown): void {
    const message = JSON.stringify(data);

    if (this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(message);
        return;
      } catch (err) {
        log.warn('[WebSocketService] Send failed, queuing:', err);
      }
    }

    // Buffer for later
    if (this.outgoingQueue.length < WebSocketService.MAX_QUEUE_SIZE) {
      this.outgoingQueue.push(message);
      log.debug(`[WebSocketService] Message queued (${this.outgoingQueue.length} pending)`);
    } else {
      log.warn('[WebSocketService] Outgoing queue full, dropping message');
    }
  }

  /**
   * Register a callback to receive validated TrustSignal events.
   * @param callback - invoked with each deserialized and validated signal
   */
  onSignal(callback: SignalCallback): void {
    this.signalListeners.push(callback);
  }

  /**
   * Register a callback for WebSocket lifecycle events.
   * Events: 'signal', 'connected', 'disconnected', 'error', 'reconnecting'
   * @param callback - invoked with event type and optional data
   */
  onEvent(callback: EventCallback): void {
    this.eventListeners.push(callback);
  }

  /**
   * Internal: perform the actual WebSocket connection.
   */
  private doConnect(): void {
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }

    this.setState('connecting');
    const wsUrl = `${this.url}/ws/events`;
    log.info(`[WebSocketService] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      log.error('[WebSocketService] Failed to create WebSocket:', err);
      this.handleConnectionFailure();
      return;
    }

    this.ws.onopen = () => {
      log.info('[WebSocketService] Connection established');
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.setState('connected');
      this.startHeartbeat();
      this.flushOutgoingQueue();
      this.emitEvent('connected');

      // If we were on fallback polling, stop it
      if (this.usingFallbackPolling) {
        this.stopFallbackPolling();
        this.usingFallbackPolling = false;
        log.info('[WebSocketService] WebSocket recovered, stopped REST polling fallback');
      }
    };

    this.ws.onclose = (event) => {
      log.info(
        `[WebSocketService] Connection closed (code: ${event.code}, reason: ${event.reason || 'none'})`,
      );
      this.stopHeartbeat();

      if (this.state === 'connected') {
        this.setState('disconnected');
        this.emitEvent('disconnected');
      }

      if (!this.intentionalDisconnect) {
        this.handleConnectionFailure();
      }
    };

    this.ws.onerror = (event) => {
      log.error('[WebSocketService] Connection error:', event);
      this.emitEvent('error', event);
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event);
    };
  }

  /**
   * Handle an incoming WebSocket message.
   * Parses the payload, checks for pong responses, and validates
   * trust signals before emitting to listeners.
   * @param event - the raw WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data: unknown = JSON.parse(String(event.data));
      log.debug('[WebSocketService] Message received');

      // Handle pong response
      if (typeof data === 'object' && data !== null && 'type' in data) {
        const typed = data as { type: string };
        if (typed.type === 'pong') {
          this.clearPongTimeout();
          return;
        }
      }

      // Attempt to deserialize as TrustSignal
      const signal = this.validateSignal(data);
      if (signal) {
        for (const listener of this.signalListeners) {
          try {
            listener(signal);
          } catch (err) {
            log.error('[WebSocketService] Error in signal listener:', err);
          }
        }
        this.emitEvent('signal', signal);
      }
    } catch (err) {
      log.warn('[WebSocketService] Failed to parse message:', err);
    }
  }

  /**
   * Validate and deserialize an incoming message as a TrustSignal.
   * Checks for required fields and correct types.
   * @param data - raw parsed JSON data
   * @returns validated TrustSignal or null if invalid
   */
  private validateSignal(data: unknown): TrustSignal | null {
    if (typeof data !== 'object' || data === null) return null;

    const obj = data as Record<string, unknown>;

    // Check required fields
    const validSources: AdapterType[] = ['zoom', 'teams', 'email', 'file', 'api'];
    if (!validSources.includes(obj.source as AdapterType)) return null;
    if (typeof obj.score !== 'number' || obj.score < 0 || obj.score > 100) return null;
    if (typeof obj.weight !== 'number') return null;
    if (typeof obj.timestamp !== 'string') return null;
    if (typeof obj.metadata !== 'object' || obj.metadata === null) return null;

    return {
      source: obj.source as AdapterType,
      score: obj.score,
      weight: obj.weight,
      timestamp: obj.timestamp,
      metadata: obj.metadata as Record<string, unknown>,
    };
  }

  /**
   * Handle a connection failure by incrementing the failure counter
   * and either scheduling a reconnect or switching to REST polling fallback.
   */
  private handleConnectionFailure(): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= WebSocketService.FALLBACK_THRESHOLD && !this.usingFallbackPolling) {
      log.warn(
        `[WebSocketService] ${this.consecutiveFailures} consecutive failures, switching to REST polling`,
      );
      this.usingFallbackPolling = true;
      this.startFallbackPolling();
    }

    this.scheduleReconnect();
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
      WebSocketService.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      WebSocketService.MAX_RECONNECT_DELAY,
    );

    this.reconnectAttempts++;
    log.info(
      `[WebSocketService] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`,
    );
    this.emitEvent('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect) {
        this.doConnect();
      }
    }, delay);
  }

  /**
   * Start sending heartbeat ping messages at a regular interval.
   * Expects a pong response within PONG_TIMEOUT; reconnects if missing.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          log.debug('[WebSocketService] Heartbeat sent');

          // Set pong timeout
          this.pongTimer = setTimeout(() => {
            log.warn('[WebSocketService] Pong timeout, reconnecting');
            this.ws?.close(4000, 'Pong timeout');
          }, WebSocketService.PONG_TIMEOUT);
        } catch (err) {
          log.warn('[WebSocketService] Failed to send heartbeat:', err);
        }
      }
    }, WebSocketService.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop the heartbeat interval and clear any pending pong timeout.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearPongTimeout();
  }

  /**
   * Clear the pending pong response timeout.
   */
  private clearPongTimeout(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  /**
   * Start REST polling as a fallback when WebSocket is unavailable.
   * Polls the /api/v1/trust/signals endpoint every POLLING_INTERVAL ms.
   */
  private startFallbackPolling(): void {
    this.stopFallbackPolling();

    log.info(`[WebSocketService] Starting REST polling fallback (every ${WebSocketService.POLLING_INTERVAL}ms)`);

    this.pollingTimer = setInterval(async () => {
      try {
        const httpUrl = this.url.replace(/^ws/, 'http');
        const response = await fetch(`${httpUrl}/api/v1/trust/signals/latest`, {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const signals = (await response.json()) as unknown[];
          for (const raw of signals) {
            const signal = this.validateSignal(raw);
            if (signal) {
              for (const listener of this.signalListeners) {
                try { listener(signal); } catch (err) {
                  log.error('[WebSocketService] Error in signal listener:', err);
                }
              }
              this.emitEvent('signal', signal);
            }
          }
        }
      } catch (err) {
        log.debug('[WebSocketService] REST polling request failed:', err);
      }
    }, WebSocketService.POLLING_INTERVAL);
  }

  /**
   * Stop the REST polling fallback timer.
   */
  private stopFallbackPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Flush all buffered outgoing messages upon reconnection.
   */
  private flushOutgoingQueue(): void {
    if (this.outgoingQueue.length === 0) return;

    log.info(`[WebSocketService] Flushing ${this.outgoingQueue.length} queued messages`);
    const queue = [...this.outgoingQueue];
    this.outgoingQueue = [];

    for (const message of queue) {
      try {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(message);
        } else {
          this.outgoingQueue.push(message);
          break;
        }
      } catch (err) {
        log.warn('[WebSocketService] Failed to flush message:', err);
        this.outgoingQueue.push(message);
        break;
      }
    }
  }

  /**
   * Update the connection state.
   * @param newState - the new connection state
   */
  private setState(newState: WsConnectionState): void {
    if (this.state !== newState) {
      log.info(`[WebSocketService] State: ${this.state} → ${newState}`);
      this.state = newState;
    }
  }

  /**
   * Emit a lifecycle event to all registered listeners.
   * @param event - the event type
   * @param data - optional event data
   */
  private emitEvent(event: WsEventType, data?: unknown): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event, data);
      } catch (err) {
        log.error('[WebSocketService] Error in event listener:', err);
      }
    }
  }

  /**
   * Clean up reconnect and heartbeat timers.
   */
  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
