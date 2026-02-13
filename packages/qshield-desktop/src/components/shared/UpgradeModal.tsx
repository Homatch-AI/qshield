import { useEffect, useRef } from 'react';
/**
 * Types and features inlined to avoid pulling Node.js-only
 * modules from @qshield/core into the browser bundle.
 */
type QShieldEdition = 'personal' | 'business' | 'enterprise';
type Feature =
  | 'overlay_shield'
  | 'evidence_vault'
  | 'zoom_monitor'
  | 'teams_monitor'
  | 'email_monitor'
  | 'policy_engine'
  | 'siem_export'
  | 'enterprise_alerting'
  | 'trust_certificates'
  | 'advanced_analytics';

const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
  personal: ['overlay_shield'],
  business: [
    'overlay_shield',
    'evidence_vault',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'policy_engine',
    'trust_certificates',
  ],
  enterprise: [
    'overlay_shield',
    'evidence_vault',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'policy_engine',
    'siem_export',
    'enterprise_alerting',
    'trust_certificates',
    'advanced_analytics',
  ],
};

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredFeature?: string;
}

/** Human-readable feature labels. */
const FEATURE_LABELS: Record<Feature, string> = {
  overlay_shield: 'Shield Overlay',
  evidence_vault: 'Evidence Vault',
  zoom_monitor: 'Zoom Monitor',
  teams_monitor: 'Teams Monitor',
  email_monitor: 'Email Monitor',
  policy_engine: 'Policy Engine',
  siem_export: 'SIEM Export',
  enterprise_alerting: 'Enterprise Alerting',
  trust_certificates: 'Trust Certificates',
  advanced_analytics: 'Advanced Analytics',
};

/** All features in display order. */
const ALL_FEATURES: Feature[] = [
  'overlay_shield',
  'evidence_vault',
  'zoom_monitor',
  'teams_monitor',
  'email_monitor',
  'policy_engine',
  'trust_certificates',
  'siem_export',
  'enterprise_alerting',
  'advanced_analytics',
];

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function DashIcon() {
  return <span className="text-slate-600">—</span>;
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

  const personalFeatures = new Set(EDITION_FEATURES.personal);
  const businessFeatures = new Set(EDITION_FEATURES.business);
  const enterpriseFeatures = new Set(EDITION_FEATURES.enterprise);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
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
        <div className="px-6 py-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="text-left py-2 pr-4">Feature</th>
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
        <div className="flex items-center gap-3 border-t border-slate-700 px-6 py-4">
          <button
            onClick={() => {
              console.log('[UpgradeModal] Upgrade to Business clicked');
              onClose();
            }}
            className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            Upgrade to Business
          </button>
          <button
            onClick={() => {
              console.log('[UpgradeModal] Upgrade to Enterprise clicked');
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
