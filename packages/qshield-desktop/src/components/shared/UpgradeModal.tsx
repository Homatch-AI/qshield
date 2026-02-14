import { useEffect, useRef } from 'react';
import { openUpgradeUrl } from '@/lib/upgrade-urls';
import {
  getRequiredEdition,
  EDITION_LABELS,
  EDITION_FEATURES,
} from '@/stores/license-store';
import type { Feature } from '@/stores/license-store';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredFeature?: string;
}

/** Human-readable feature labels. */
const FEATURE_LABELS: Record<Feature, string> = {
  // Shield
  shield_basic: 'Shield (Basic)',
  shield_breathing: 'Shield (Breathing)',
  // Email verification
  verify_send: 'Email Verification',
  verify_tls_check: 'TLS Check',
  verify_routing_check: 'Routing Check',
  verify_intercept_scan: 'Intercept Scan',
  verify_custom_badge: 'Custom Badge',
  verify_remove_branding: 'Remove Branding',
  verify_analytics: 'Verification Analytics',
  verify_bulk_api: 'Bulk API',
  verify_custom_domain: 'Custom Domain',
  // Timeline
  timeline_24h: 'Timeline (24h)',
  timeline_full: 'Timeline (Full)',
  // Evidence
  evidence_preview: 'Evidence Preview',
  evidence_full: 'Evidence Vault',
  evidence_export: 'Evidence Export',
  evidence_api_export: 'Evidence API Export',
  // Crypto
  crypto_basic: 'Crypto Guard',
  crypto_monitor: 'Crypto Monitor',
  crypto_analytics: 'Crypto Analytics',
  // Monitoring
  zoom_monitor: 'Zoom Monitor',
  teams_monitor: 'Teams Monitor',
  email_monitor: 'Email Monitor',
  file_monitor: 'File Monitor',
  api_monitor: 'API Monitor',
  // Certificates
  cert_basic: 'Trust Certificates',
  cert_pro: 'Certificates (Pro)',
  email_signature: 'Email Signature',
  // Policy & alerts
  alerts_basic: 'Alerts (Basic)',
  alerts_full: 'Alerts (Full)',
  policy_engine: 'Policy Engine',
  auto_freeze: 'Auto Freeze',
  escalation_rules: 'Escalation Rules',
  policy_templates: 'Policy Templates',
  // Compliance & enterprise
  siem_export: 'SIEM Export',
  audit_log: 'Audit Log',
  compliance_dashboard: 'Compliance Dashboard',
  sso_scim: 'SSO / SCIM',
  org_dashboard: 'Org Dashboard',
  soc_routing: 'SOC Routing',
  insurance_readiness: 'Insurance Readiness',
};

/** Features grouped for display in the comparison table. */
const DISPLAY_FEATURES: Feature[] = [
  // Shield
  'shield_basic', 'shield_breathing',
  // Email verification
  'verify_send', 'verify_tls_check', 'verify_routing_check',
  'verify_intercept_scan', 'verify_custom_badge', 'verify_remove_branding',
  'verify_analytics', 'verify_bulk_api', 'verify_custom_domain',
  // Timeline
  'timeline_24h', 'timeline_full',
  // Evidence
  'evidence_preview', 'evidence_full', 'evidence_export', 'evidence_api_export',
  // Crypto
  'crypto_basic', 'crypto_monitor', 'crypto_analytics',
  // Monitoring
  'zoom_monitor', 'teams_monitor', 'email_monitor', 'file_monitor', 'api_monitor',
  // Certificates
  'cert_basic', 'cert_pro', 'email_signature',
  // Policy & alerts
  'alerts_basic', 'alerts_full', 'policy_engine', 'auto_freeze',
  'escalation_rules', 'policy_templates',
  // Compliance & enterprise
  'siem_export', 'audit_log', 'compliance_dashboard', 'sso_scim',
  'org_dashboard', 'soc_routing', 'insurance_readiness',
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

  const requiredEdition = requiredFeature
    ? getRequiredEdition(requiredFeature as Feature)
    : undefined;
  const requiredLabel = requiredEdition
    ? EDITION_LABELS[requiredEdition]
    : undefined;

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
                <span className="text-sky-400">{FEATURE_LABELS[requiredFeature as Feature] ?? requiredFeature}</span>
                {requiredLabel && (
                  <> requires <span className="font-medium text-sky-400">{requiredLabel}</span> plan</>
                )}
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
              {DISPLAY_FEATURES.map((feature) => (
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
