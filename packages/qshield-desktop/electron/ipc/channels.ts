export const IPC_CHANNELS = {
  // Trust
  TRUST_GET_STATE: 'trust:get-state',
  TRUST_SUBSCRIBE: 'trust:subscribe',
  TRUST_UNSUBSCRIBE: 'trust:unsubscribe',

  // Evidence
  EVIDENCE_LIST: 'evidence:list',
  EVIDENCE_GET: 'evidence:get',
  EVIDENCE_VERIFY: 'evidence:verify',
  EVIDENCE_SEARCH: 'evidence:search',
  EVIDENCE_EXPORT: 'evidence:export',

  // Certificates
  CERT_GENERATE: 'cert:generate',
  CERT_LIST: 'cert:list',

  // Gateway
  GATEWAY_STATUS: 'gateway:status',
  GATEWAY_CONNECT: 'gateway:connect',
  GATEWAY_DISCONNECT: 'gateway:disconnect',

  // Alerts
  ALERT_LIST: 'alert:list',
  ALERT_DISMISS: 'alert:dismiss',
  ALERT_SUBSCRIBE: 'alert:subscribe',

  // Policy
  POLICY_GET: 'policy:get',
  POLICY_UPDATE: 'policy:update',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  // Adapters
  ADAPTER_STATUS: 'adapter:status',
  ADAPTER_ENABLE: 'adapter:enable',
  ADAPTER_DISABLE: 'adapter:disable',

  // App
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Event channels used for push notifications from main to renderer */
export const IPC_EVENTS = {
  TRUST_STATE_UPDATED: 'event:trust-state-updated',
  ALERT_RECEIVED: 'event:alert-received',
  ADAPTER_STATUS_CHANGED: 'event:adapter-status-changed',
  GATEWAY_CONNECTION_CHANGED: 'event:gateway-connection-changed',
} as const;
