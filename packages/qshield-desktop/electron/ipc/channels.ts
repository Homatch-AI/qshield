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
  /** Export a certificate as PDF with save dialog */
  CERT_EXPORT_PDF: 'cert:export-pdf',

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
  /** Read all config values */
  CONFIG_GET_ALL: 'config:get-all',
  /** Write a config value by dot-notation key (rate-limited: 10/min) */
  CONFIG_SET: 'config:set',

  // ── Adapters ───────────────────────────────────────────────────────────
  /** Get status of all monitoring adapters */
  ADAPTER_STATUS: 'adapter:status',
  /** Enable a monitoring adapter by ID */
  ADAPTER_ENABLE: 'adapter:enable',
  /** Disable a monitoring adapter by ID */
  ADAPTER_DISABLE: 'adapter:disable',

  // ── Signature ─────────────────────────────────────────────────────────
  /** Generate email signature HTML with current trust score */
  SIGNATURE_GENERATE: 'signature:generate',
  /** Generate and copy email signature HTML to system clipboard */
  SIGNATURE_COPY: 'signature:copy',
  /** Get saved signature preferences */
  SIGNATURE_GET_CONFIG: 'signature:get-config',
  /** Save signature preferences */
  SIGNATURE_SET_CONFIG: 'signature:set-config',

  // ── Verification ────────────────────────────────────────────────────────
  /** Get signature verification stats (total generated, clicks, CTR) */
  VERIFY_GET_STATS: 'verify:get-stats',

  // ── Crypto ──────────────────────────────────────────────────────────────
  /** Get crypto security overview status */
  CRYPTO_GET_STATUS: 'crypto:get-status',
  /** Verify a crypto address format, checksum, and scam database */
  CRYPTO_VERIFY_ADDRESS: 'crypto:verify-address',
  /** Verify a transaction hash format */
  CRYPTO_VERIFY_TRANSACTION: 'crypto:verify-transaction',
  /** Get the trusted address book */
  CRYPTO_GET_ADDRESS_BOOK: 'crypto:get-address-book',
  /** Add an address to the trusted address book */
  CRYPTO_ADD_TRUSTED_ADDRESS: 'crypto:add-trusted-address',
  /** Remove an address from the trusted address book */
  CRYPTO_REMOVE_TRUSTED_ADDRESS: 'crypto:remove-trusted-address',
  /** Get crypto-specific security alerts */
  CRYPTO_GET_ALERTS: 'crypto:get-alerts',
  /** Get clipboard guard status */
  CRYPTO_CLIPBOARD_STATUS: 'crypto:clipboard-status',

  // ── License ──────────────────────────────────────────────────────────
  /** Get the current license */
  LICENSE_GET: 'license:get',
  /** Set (activate) a license */
  LICENSE_SET: 'license:set',
  /** Clear the active license */
  LICENSE_CLEAR: 'license:clear',
  /** Check whether a feature is available under the current license */
  LICENSE_CHECK_FEATURE: 'license:check-feature',

  // ── App ────────────────────────────────────────────────────────────────
  /** Get the application version string */
  APP_VERSION: 'app:version',
  /** Request graceful application shutdown */
  APP_QUIT: 'app:quit',
  /** Focus the main window (used by shield overlay double-click) */
  APP_FOCUS_MAIN: 'app:focus-main',
  /** Toggle the main window visibility (used by shield overlay double-click) */
  APP_TOGGLE_MAIN: 'app:toggle-main-window',
  /** Toggle the shield overlay window on/off */
  APP_TOGGLE_SHIELD: 'app:toggle-shield-overlay',
  /** Move the shield overlay to a new screen corner */
  SHIELD_SET_POSITION: 'shield:set-position',
  /** Set the shield overlay opacity (0.1–1.0) */
  SHIELD_SET_OPACITY: 'shield:set-opacity',
  /** Focus the main window and navigate to the alerts page */
  APP_SHOW_ALERTS: 'app:show-alerts',
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
