import { useEffect, useRef } from 'react';
import { openUpgradeUrl } from '@/lib/upgrade-urls';
/**
 * Types and features inlined to avoid pulling Node.js-only
 * modules from @qshield/core into the browser bundle.
 */
type QShieldEdition = 'free' | 'personal' | 'business' | 'enterprise';
type Feature =
  // Monitoring (11)
  | 'dashboard'
  | 'trust_score'
  | 'overlay_shield'
  | 'zoom_monitor'
  | 'teams_monitor'
  | 'email_monitor'
  | 'slack_monitor'
  | 'gdrive_monitor'
  | 'browser_monitor'
  | 'screen_monitor'
  | 'clipboard_monitor'
  // Security (8)
  | 'crypto_guard'
  | 'phishing_detection'
  | 'dlp_scanning'
  | 'device_trust'
  | 'network_monitor'
  | 'usb_monitor'
  | 'evidence_vault'
  | 'trust_certificates'
  // Reporting (5)
  | 'custom_reports'
  | 'compliance_dashboard'
  | 'scheduled_reports'
  | 'audit_trail'
  | 'advanced_analytics'
  // Integration (5)
  | 'api_access'
  | 'webhook_notifications'
  | 'sso_integration'
  | 'ldap_sync'
  | 'siem_export'
  // Management (6)
  | 'policy_engine'
  | 'enterprise_alerting'
  | 'multi_tenant'
  | 'role_based_access'
  | 'remote_wipe'
  | 'custom_branding';

const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
  free: [
    'dashboard',
    'trust_score',
    'overlay_shield',
    'clipboard_monitor',
  ],
  personal: [
    'dashboard',
    'trust_score',
    'overlay_shield',
    'clipboard_monitor',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'crypto_guard',
    'phishing_detection',
    'evidence_vault',
  ],
  business: [
    'dashboard',
    'trust_score',
    'overlay_shield',
    'clipboard_monitor',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'crypto_guard',
    'phishing_detection',
    'evidence_vault',
    'slack_monitor',
    'gdrive_monitor',
    'browser_monitor',
    'screen_monitor',
    'dlp_scanning',
    'device_trust',
    'network_monitor',
    'usb_monitor',
    'trust_certificates',
    'custom_reports',
    'policy_engine',
    'api_access',
  ],
  enterprise: [
    'dashboard',
    'trust_score',
    'overlay_shield',
    'clipboard_monitor',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'crypto_guard',
    'phishing_detection',
    'evidence_vault',
    'slack_monitor',
    'gdrive_monitor',
    'browser_monitor',
    'screen_monitor',
    'dlp_scanning',
    'device_trust',
    'network_monitor',
    'usb_monitor',
    'trust_certificates',
    'custom_reports',
    'policy_engine',
    'api_access',
    'compliance_dashboard',
    'scheduled_reports',
    'audit_trail',
    'advanced_analytics',
    'webhook_notifications',
    'sso_integration',
    'ldap_sync',
    'siem_export',
    'enterprise_alerting',
    'multi_tenant',
    'role_based_access',
    'remote_wipe',
    'custom_branding',
  ],
};

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredFeature?: string;
}

/** Human-readable feature labels. */
const FEATURE_LABELS: Record<Feature, string> = {
  // Monitoring
  dashboard: 'Dashboard',
  trust_score: 'Trust Score',
  overlay_shield: 'Shield Overlay',
  zoom_monitor: 'Zoom Monitor',
  teams_monitor: 'Teams Monitor',
  email_monitor: 'Email Monitor',
  slack_monitor: 'Slack Monitor',
  gdrive_monitor: 'Google Drive Monitor',
  browser_monitor: 'Browser Monitor',
  screen_monitor: 'Screen Monitor',
  clipboard_monitor: 'Clipboard Monitor',
  // Security
  crypto_guard: 'Crypto Guard',
  phishing_detection: 'Phishing Detection',
  dlp_scanning: 'DLP Scanning',
  device_trust: 'Device Trust',
  network_monitor: 'Network Monitor',
  usb_monitor: 'USB Monitor',
  evidence_vault: 'Evidence Vault',
  trust_certificates: 'Trust Certificates',
  // Reporting
  custom_reports: 'Custom Reports',
  compliance_dashboard: 'Compliance Dashboard',
  scheduled_reports: 'Scheduled Reports',
  audit_trail: 'Audit Trail',
  advanced_analytics: 'Advanced Analytics',
  // Integration
  api_access: 'API Access',
  webhook_notifications: 'Webhook Notifications',
  sso_integration: 'SSO Integration',
  ldap_sync: 'LDAP Sync',
  siem_export: 'SIEM Export',
  // Management
  policy_engine: 'Policy Engine',
  enterprise_alerting: 'Enterprise Alerting',
  multi_tenant: 'Multi-Tenant',
  role_based_access: 'Role-Based Access',
  remote_wipe: 'Remote Wipe',
  custom_branding: 'Custom Branding',
};

/** All features in display order. */
const ALL_FEATURES: Feature[] = [
  // Monitoring
  'dashboard',
  'trust_score',
  'overlay_shield',
  'clipboard_monitor',
  'zoom_monitor',
  'teams_monitor',
  'email_monitor',
  'slack_monitor',
  'gdrive_monitor',
  'browser_monitor',
  'screen_monitor',
  // Security
  'crypto_guard',
  'phishing_detection',
  'dlp_scanning',
  'device_trust',
  'network_monitor',
  'usb_monitor',
  'evidence_vault',
  'trust_certificates',
  // Reporting
  'custom_reports',
  'compliance_dashboard',
  'scheduled_reports',
  'audit_trail',
  'advanced_analytics',
  // Integration
  'api_access',
  'webhook_notifications',
  'sso_integration',
  'ldap_sync',
  'siem_export',
  // Management
  'policy_engine',
  'enterprise_alerting',
  'multi_tenant',
  'role_based_access',
  'remote_wipe',
  'custom_branding',
];

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function DashIcon() {
  return <span className="text-slate-600">&mdash;</span>;
}

export function UpgradeModal({ isOpen, onClose, requiredFeature }: UpgradeModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const freeFeatures = new Set(EDITION_FEATURES.free);
  const personalFeatures = new Set(EDITION_FEATURES.personal);
  const businessFeatures = new Set(EDITION_FEATURES.business);
  const enterpriseFeatures = new Set(EDITION_FEATURES.enterprise);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Upgrade QShield</h2>
            {requiredFeature && (
              <p className="text-xs text-slate-400 mt-0.5">
                Unlock <span className="text-sky-400">{FEATURE_LABELS[requiredFeature as Feature] ?? requiredFeature}</span> and more
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Comparison table */}
        <div className="px-6 py-4 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="text-left py-2 pr-4">Feature</th>
                <th className="text-center py-2 px-2">Free</th>
                <th className="text-center py-2 px-2">Personal</th>
                <th className="text-center py-2 px-2">Business</th>
                <th className="text-center py-2 px-2">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {ALL_FEATURES.map((feature) => (
                <tr
                  key={feature}
                  className={feature === requiredFeature ? 'bg-sky-500/5' : ''}
                >
                  <td className="py-2 pr-4 text-slate-300">
                    {FEATURE_LABELS[feature]}
                    {feature === requiredFeature && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase text-sky-400">required</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {freeFeatures.has(feature) ? <CheckIcon /> : <DashIcon />}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {personalFeatures.has(feature) ? <CheckIcon /> : <DashIcon />}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {businessFeatures.has(feature) ? <CheckIcon /> : <DashIcon />}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {enterpriseFeatures.has(feature) ? <CheckIcon /> : <DashIcon />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 border-t border-slate-700 px-6 py-4 shrink-0">
          <button
            onClick={() => {
              openUpgradeUrl('free_to_personal');
              onClose();
            }}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            Get Personal
          </button>
          <button
            onClick={() => {
              openUpgradeUrl('personal_to_business');
              onClose();
            }}
            className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            Upgrade to Business
          </button>
          <button
            onClick={() => {
              openUpgradeUrl('business_to_enterprise');
              onClose();
            }}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            Upgrade to Enterprise
          </button>
        </div>
      </div>
    </div>
  );
}
