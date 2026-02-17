const EVENT_DESCRIPTIONS: Record<string, Record<string, string>> = {
  zoom: {
    'meeting.started': 'Zoom meeting started',
    'participant.joined': 'Participant joined Zoom meeting',
    'screen.shared': 'Screen shared during Zoom meeting',
    'encryption.verified': 'Zoom encryption verified',
  },
  teams: {
    'call.started': 'Teams call started',
    'message.sent': 'Message sent via Teams',
    'presence.changed': 'Teams presence status changed',
    'file.shared': 'File shared in Teams',
  },
  email: {
    'email.received': 'Email received',
    'email.sent': 'Email sent',
    'dkim.verified': 'DKIM signature verified',
    'spf.pass': 'SPF authentication passed',
  },
  file: {
    'file.created': 'File created',
    'file.modified': 'File modified',
    'file.accessed': 'File accessed',
    'file.moved': 'File moved',
    'high-trust:asset-modified': 'High-trust asset modified',
    'high-trust:asset-created': 'High-trust asset created',
  },
  api: {
    'auth.success': 'API authentication successful',
    'request.inbound': 'Inbound API request',
    'rate.limited': 'API rate limit triggered',
    'auth.failure': 'API authentication failed',
  },
  crypto: {
    'clipboard-check': 'Crypto clipboard address checked',
    'transaction-signed': 'Crypto transaction signed',
    'wallet-connected': 'Crypto wallet connected',
    'address-verified': 'Crypto wallet address verified',
    'chain-mismatch': 'Blockchain chain mismatch detected',
  },
};

const POSITIVE_EVENTS = new Set([
  'encryption.verified',
  'dkim.verified',
  'spf.pass',
  'auth.success',
  'wallet-connected',
  'address-verified',
]);

const NEGATIVE_EVENTS = new Set([
  'auth.failure',
  'rate.limited',
  'chain-mismatch',
  'high-trust:asset-modified',
  'high-trust:asset-deleted',
]);

function titleCase(eventType: string): string {
  const words = eventType.replace(/[.\-:_]/g, ' ').trim();
  if (!words) return eventType;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function describeEvent(
  source: string,
  eventType: string,
  payload?: Record<string, unknown> | null,
): string {
  const base = EVENT_DESCRIPTIONS[source]?.[eventType];

  if (base) {
    if (source === 'email' && eventType === 'email.received' && payload?.sender) {
      return `${base} from ${payload.sender}`;
    }
    if (source === 'email' && eventType === 'email.sent' && payload?.recipient) {
      return `${base} to ${payload.recipient}`;
    }
    if (source === 'file' && eventType === 'file.created' && payload?.filename) {
      return `${base}: ${payload.filename}`;
    }
    return base;
  }

  return titleCase(eventType);
}

export function getImpactLabel(
  _source: string,
  eventType: string,
): 'positive' | 'neutral' | 'negative' {
  if (POSITIVE_EVENTS.has(eventType)) return 'positive';
  if (NEGATIVE_EVENTS.has(eventType)) return 'negative';
  return 'neutral';
}

export const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  zoom: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  teams: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
  email: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  file: { bg: 'bg-teal-500/10', text: 'text-teal-400' },
  api: { bg: 'bg-sky-500/10', text: 'text-sky-400' },
  crypto: { bg: 'bg-orange-500/10', text: 'text-orange-400' },
};

const EVENT_ICONS: Record<string, Record<string, string>> = {
  zoom: {
    'meeting.started': 'video',
    'meeting.ended': 'video-off',
    'participant.joined': 'user-plus',
    'screen.shared': 'monitor',
    'recording.started': 'circle-dot',
    'encryption.verified': 'shield-check',
  },
  teams: {
    'call.started': 'phone',
    'call.ended': 'phone-off',
    'message.sent': 'message',
    'file.shared': 'file',
    'presence.changed': 'user',
  },
  email: {
    'email.received': 'mail',
    'email.sent': 'send',
    'email.forwarded': 'forward',
    'attachment.downloaded': 'paperclip',
    'link.clicked': 'link',
    'dkim.verified': 'shield-check',
    'spf.pass': 'shield-check',
  },
  file: {
    'file.created': 'file-plus',
    'file.modified': 'file-edit',
    'file.deleted': 'file-minus',
    'file.moved': 'file-arrow',
    'file.accessed': 'eye',
    'high-trust:asset-modified': 'alert-triangle',
    'high-trust:asset-created': 'shield-plus',
  },
  api: {
    'auth.success': 'key',
    'auth.failure': 'key-x',
    'request.inbound': 'arrow-down',
    'request.outbound': 'arrow-up',
    'rate.limited': 'gauge',
  },
  crypto: {
    'clipboard-check': 'clipboard',
    'clipboard.check': 'clipboard',
    'transaction-signed': 'pen',
    'transaction.signed': 'pen',
    'wallet-connected': 'wallet',
    'wallet.connected': 'wallet',
    'address-verified': 'check-circle',
    'address.verified': 'check-circle',
    'chain-mismatch': 'alert-triangle',
    'chain.mismatch': 'alert-triangle',
  },
};

/** Return a semantic icon name for an event type. Consumers map to SVGs. */
export function getEventIcon(source: string, eventType: string): string {
  return EVENT_ICONS[source]?.[eventType] ?? 'activity';
}

const SEVERITY_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  low: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  positive: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  neutral: { bg: 'bg-slate-700/50', text: 'text-slate-400', border: 'border-slate-600/50' },
  negative: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
};

/** Return Tailwind classes for a severity or impact level. */
export function getSeverityColor(severity: string): { bg: string; text: string; border: string } {
  return SEVERITY_COLOR_MAP[severity] ?? SEVERITY_COLOR_MAP.neutral;
}

// Re-export describeAlert so consumers can use either module
export { describeAlert } from '@/lib/alert-descriptions';
export type { DescribedAlert, AlertAction } from '@/lib/alert-descriptions';
