import type { TrustLevel } from '@qshield/core';

export const TRUST_LEVEL_COLORS: Record<TrustLevel, { bg: string; text: string; border: string; dot: string }> = {
  verified: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  normal: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-500',
    border: 'border-sky-500/30',
    dot: 'bg-sky-500',
  },
  elevated: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
  },
  warning: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-500',
    border: 'border-orange-500/30',
    dot: 'bg-orange-500',
  },
  critical: {
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    border: 'border-red-500/30',
    dot: 'bg-red-500',
  },
};

export const TRUST_LEVEL_STROKE_COLORS: Record<TrustLevel, string> = {
  verified: '#10b981',
  normal: '#0ea5e9',
  elevated: '#f59e0b',
  warning: '#f97316',
  critical: '#ef4444',
};

export const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  low: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
};

export const ANIMATION_DURATION = {
  fast: 150,
  normal: 300,
  slow: 500,
  gauge: 1000,
} as const;

export const PAGINATION_DEFAULTS = {
  pageSize: 20,
  initialPage: 1,
} as const;

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  requiredFeature?: string;
  /** If set, show the item as locked (paywalled) when user has this feature but not requiredFeature. Without this, items are hidden entirely when locked. */
  visibleFrom?: string;
}

export const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'gauge' },
  { path: '/timeline', label: 'Timeline', icon: 'clock',
    requiredFeature: 'timeline_24h' as const },
  { path: '/vault', label: 'Double-Helix Vault', icon: 'vault',
    requiredFeature: 'evidence_full' as const, visibleFrom: 'evidence_preview' as const },
  { path: '/messages', label: 'Secure Messages', icon: 'lock',
    requiredFeature: 'secure_message_send' as const },
  { path: '/certificates', label: 'Trust Reports', icon: 'certificate',
    requiredFeature: 'cert_basic' as const },
  { path: '/alerts', label: 'Alerts', icon: 'bell',
    requiredFeature: 'alerts_full' as const, visibleFrom: 'alerts_basic' as const },
  { path: '/assets', label: 'High-Trust Assets', icon: 'shield' },
  { path: '/ai-governance', label: 'AI Governance', icon: 'cpu' },
  { path: '/profile', label: 'Trust Profile', icon: 'user-shield' },
  { path: '/crypto', label: 'Crypto Security', icon: 'shield-check',
    requiredFeature: 'crypto_basic' as const },
  { path: '/settings', label: 'Settings', icon: 'settings' },
] as const;

export const ADAPTER_LABELS: Record<string, string> = {
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  email: 'Email Monitor',
  file: 'File Monitor',
  api: 'API Gateway',
  crypto: 'Crypto Wallet',
  ai: 'AI Agent Monitor',
};
