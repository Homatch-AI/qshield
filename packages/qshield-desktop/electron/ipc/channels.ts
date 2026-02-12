/**
 * IPC channel constants for communication between main and renderer processes.
 * All IPC communication must go through these typed channel constants.
 * Never use raw strings for IPC channels — always reference this module.
 */

/** Request-response channels used with ipcRenderer.invoke / ipcMain.handle */
export const IPC_CHANNELS = {
  // ── Trust ──────────────────────────────────────────────────────────────
  /** Retrieve current trust state (score, level, signals) */
  TRUST_GET_STATE: 'trust:get-state',
  /** Begin receiving trust state push updates via IPC_EVENTS.TRUST_STATE_UPDATED */
  TRUST_SUBSCRIBE: 'trust:subscribe',
  /** Stop receiving trust state push updates */
  TRUST_UNSUBSCRIBE: 'trust:unsubscribe',

  // ── Evidence ───────────────────────────────────────────────────────────
  /** List evidence records with pagination and optional sorting */
  EVIDENCE_LIST: 'evidence:list',
  /** Get a single evidence record by UUID */
  EVIDENCE_GET: 'evidence:get',
  /** Verify integrity of an evidence record's hash chain */
  EVIDENCE_VERIFY: 'evidence:verify',
  /** Full-text search across evidence records */
  EVIDENCE_SEARCH: 'evidence:search',
  /** Export selected evidence records (rate-limited: 1/min) */
  EVIDENCE_EXPORT: 'evidence:export',

  // ── Certificates ───────────────────────────────────────────────────────
  /** Generate a trust certificate for a session (rate-limited: 1/min) */
  CERT_GENERATE: 'cert:generate',
  /** List all generated certificates */
  CERT_LIST: 'cert:list',

  // ── Gateway ────────────────────────────────────────────────────────────
  /** Get gateway connection status */
  GATEWAY_STATUS: 'gateway:status',
  /** Connect to a QShield Gateway by URL */
  GATEWAY_CONNECT: 'gateway:connect',
  /** Disconnect from the current gateway */
  GATEWAY_DISCONNECT: 'gateway:disconnect',

  // ── Alerts ─────────────────────────────────────────────────────────────
  /** List all active alerts */
  ALERT_LIST: 'alert:list',
  /** Dismiss an alert by UUID */
  ALERT_DISMISS: 'alert:dismiss',
  /** Subscribe to real-time alert push events */
  ALERT_SUBSCRIBE: 'alert:subscribe',

  // ── Policy ─────────────────────────────────────────────────────────────
  /** Get the current policy configuration */
  POLICY_GET: 'policy:get',
  /** Update the policy configuration */
  POLICY_UPDATE: 'policy:update',

  // ── Config ─────────────────────────────────────────────────────────────
  /** Read a config value by dot-notation key */
  CONFIG_GET: 'config:get',
  /** Write a config value by dot-notation key (rate-limited: 10/min) */
  CONFIG_SET: 'config:set',

  // ── Adapters ───────────────────────────────────────────────────────────
  /** Get status of all monitoring adapters */
  ADAPTER_STATUS: 'adapter:status',
  /** Enable a monitoring adapter by ID */
  ADAPTER_ENABLE: 'adapter:enable',
  /** Disable a monitoring adapter by ID */
  ADAPTER_DISABLE: 'adapter:disable',

  // ── App ────────────────────────────────────────────────────────────────
  /** Get the application version string */
  APP_VERSION: 'app:version',
  /** Request graceful application shutdown */
  APP_QUIT: 'app:quit',
} as const;

/** Union type of all valid IPC channel strings */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/**
 * Push-event channels sent from main process to renderer.
 * These use webContents.send() and are listened to via ipcRenderer.on().
 */
export const IPC_EVENTS = {
  /** Fired when the trust state changes (score, level, or signals updated) */
  TRUST_STATE_UPDATED: 'event:trust-state-updated',
  /** Fired when a new alert is received */
  ALERT_RECEIVED: 'event:alert-received',
  /** Fired when an adapter's connection status changes */
  ADAPTER_STATUS_CHANGED: 'event:adapter-status-changed',
  /** Fired when gateway connection state changes */
  GATEWAY_CONNECTION_CHANGED: 'event:gateway-connection-changed',
} as const;

/** Union type of all valid IPC event strings */
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
