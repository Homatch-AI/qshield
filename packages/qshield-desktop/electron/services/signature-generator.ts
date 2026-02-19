/**
 * Email signature generator that produces HTML email signatures
 * with live trust score, verification ID, and viral marketing CTAs.
 *
 * Uses table-based layout for maximum email client compatibility
 * (Outlook, Gmail, Apple Mail). All styles are inline.
 */
import { createHmac } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SignatureConfig {
  style: 'inline' | 'banner' | 'minimal';
  primaryText: string;
  secondaryText: string;
  accentColor: string;
  showScore: boolean;
  showLink: boolean;
  showIcon: boolean;
  showTimestamp: boolean;
  senderName: string;
  showTagline: boolean;
  showDownloadCta: boolean;
}

export interface SignatureResult {
  html: string;
  trustScore: number;
  trustLevel: string;
  verificationHash: string;
  verificationId: string;
  verifyUrl: string;
  generatedAt: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  style: 'inline',
  primaryText: 'Verified by QShield',
  secondaryText: 'This email is protected against silent interception',
  accentColor: '#0ea5e9',
  showScore: true,
  showLink: true,
  showIcon: true,
  showTimestamp: true,
  senderName: '',
  showTagline: true,
  showDownloadCta: true,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

let signatureHmacKey = '';

/**
 * Initialize the signature generator with a derived HMAC key.
 * Must be called before generateSignatureHTML().
 */
export function initSignatureGenerator(key: string): void {
  signatureHmacKey = key;
}

function generateVerificationHash(timestamp: string, score: number, sender: string): string {
  if (!signatureHmacKey) {
    throw new Error('[SignatureGenerator] Not initialized — call initSignatureGenerator() first');
  }
  const data = `${timestamp}:${score}:${sender}`;
  return createHmac('sha256', signatureHmacKey).update(data).digest('hex');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getLevelFromScore(score: number): string {
  if (score >= 90) return 'verified';
  if (score >= 70) return 'normal';
  if (score >= 50) return 'elevated';
  if (score >= 30) return 'warning';
  return 'critical';
}

export function getLevelColor(level: string): string {
  switch (level) {
    case 'verified': return '#10b981';
    case 'normal': return '#0ea5e9';
    case 'elevated': return '#f59e0b';
    case 'warning': return '#f97316';
    case 'critical': return '#ef4444';
    default: return '#0ea5e9';
  }
}

// ── Shield icon SVG (inline data URI) ────────────────────────────────────────

function shieldIconDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24" viewBox="0 0 120 140" fill="none"><path d="M60 8L12 30V62C12 96 32 126 60 134C88 126 108 96 108 62V30L60 8Z" fill="${color}"/><polyline points="45,68 55,78 77,56" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ── Powered-by footer row ────────────────────────────────────────────────────

function poweredByRow(config: SignatureConfig, referralId: string): string {
  if (!config.showTagline) return '';
  const downloadUrl = `https://qshield.io/download?ref=${referralId}`;
  return `<tr>
    <td style="padding:2px 0 0 0;">
      <span style="font-size:9px;color:#94a3b8;">Powered by </span>
      <a href="${downloadUrl}" style="font-size:9px;color:#94a3b8;text-decoration:none;font-weight:600;">QShield</a>
      <span style="font-size:9px;color:#cbd5e1;"> &mdash; Free Trust Protection</span>
    </td>
  </tr>`;
}

// ── HTML Generators ──────────────────────────────────────────────────────────

function buildInlineSignature(config: SignatureConfig, score: number, level: string, verifyUrl: string, timestamp: string, referralId: string): string {
  const levelColor = getLevelColor(level);
  const timeStr = config.showTimestamp
    ? new Date(timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr>
    <td style="padding:8px 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;border-left:3px solid ${config.accentColor};">
        <tr>
          ${config.showIcon ? `<td style="padding:8px 10px 8px 12px;vertical-align:middle;"><img src="${shieldIconDataUri(config.accentColor)}" width="18" height="22" alt="QShield" style="display:block;"/></td>` : ''}
          <td style="padding:8px ${config.showIcon ? '0' : '12px'} 8px ${config.showIcon ? '0' : '12px'};vertical-align:middle;">
            <span style="font-size:13px;font-weight:600;color:#1e293b;">${escapeHtml(config.primaryText)}</span>
            ${config.showScore ? `<span style="font-size:12px;font-weight:700;color:${levelColor};margin-left:8px;">Score: ${score}</span>` : ''}
          </td>
          ${config.showLink ? `<td style="padding:8px 12px 8px 12px;vertical-align:middle;"><a href="${verifyUrl}" style="font-size:11px;color:${config.accentColor};text-decoration:none;font-weight:500;">Verify&nbsp;&#8599;</a></td>` : ''}
          ${config.showTimestamp ? `<td style="padding:8px 12px 8px 0;vertical-align:middle;"><span style="font-size:10px;color:#94a3b8;">${timeStr}</span></td>` : ''}
        </tr>
      </table>
    </td>
  </tr>
  ${poweredByRow(config, referralId)}
</table>`;
}

function buildBannerSignature(config: SignatureConfig, score: number, level: string, verifyUrl: string, timestamp: string, referralId: string): string {
  const levelColor = getLevelColor(level);
  const downloadUrl = `https://qshield.io/download?ref=${referralId}`;
  const timeStr = config.showTimestamp
    ? new Date(timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;">
  <tr>
    <td style="padding:12px 0;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:${config.accentColor};width:4px;"></td>
          <td style="padding:16px 20px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                ${config.showIcon ? `<td style="vertical-align:top;padding-right:14px;width:36px;"><img src="${shieldIconDataUri(config.accentColor)}" width="32" height="38" alt="QShield" style="display:block;"/></td>` : ''}
                <td style="vertical-align:top;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tr>
                      <td>
                        <span style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(config.primaryText)}</span>
                        ${config.showScore ? `<span style="font-size:14px;font-weight:800;color:${levelColor};margin-left:10px;">${score}/100</span>` : ''}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:4px;">
                        <span style="font-size:12px;color:#64748b;line-height:1.4;">${escapeHtml(config.secondaryText)}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:8px;">
                        ${config.showLink ? `<a href="${verifyUrl}" style="font-size:11px;color:${config.accentColor};text-decoration:none;font-weight:600;">Verify this email &#8599;</a>` : ''}
                        ${config.showDownloadCta ? `<a href="${downloadUrl}" style="font-size:10px;color:#94a3b8;text-decoration:none;margin-left:12px;">Get QShield</a>` : ''}
                        ${config.showTimestamp ? `<span style="font-size:10px;color:#94a3b8;${config.showLink || config.showDownloadCta ? 'margin-left:12px;' : ''}">${timeStr}</span>` : ''}
                      </td>
                    </tr>
                    ${config.showTagline ? `<tr><td style="padding-top:6px;"><span style="font-size:10px;color:#94a3b8;">Protect your emails too &rarr; </span><a href="${downloadUrl}" style="font-size:10px;color:${config.accentColor};text-decoration:none;font-weight:500;">qshield.io</a></td></tr>` : ''}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function buildMinimalSignature(config: SignatureConfig, score: number, level: string, verifyUrl: string, timestamp: string, referralId: string): string {
  const levelColor = getLevelColor(level);
  const timeStr = config.showTimestamp
    ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '';

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr>
    <td style="padding:6px 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;padding-right:6px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${levelColor};"></span>
          </td>
          <td style="vertical-align:middle;padding-right:8px;">
            <span style="font-size:12px;color:#64748b;font-weight:500;">${escapeHtml(config.primaryText)}</span>
          </td>
          ${config.showScore ? `<td style="vertical-align:middle;padding-right:8px;"><span style="font-size:12px;font-weight:700;color:${levelColor};">${score}</span></td>` : ''}
          ${config.showLink ? `<td style="vertical-align:middle;padding-right:8px;"><a href="${verifyUrl}" style="font-size:11px;color:${config.accentColor};text-decoration:none;">verify</a></td>` : ''}
          ${config.showTimestamp ? `<td style="vertical-align:middle;"><span style="font-size:10px;color:#cbd5e1;">${timeStr}</span></td>` : ''}
        </tr>
      </table>
    </td>
  </tr>
  ${poweredByRow(config, referralId)}
</table>`;
}

// ── Compact verification badge (for browser extension injection) ──────────

export function generateVerificationBadgeHtml(opts: {
  verifyUrl: string;
  trustScore: number;
  trustLevel: string;
  senderName: string;
  showBranding: boolean;
}): string {
  const levelColor = getLevelColor(opts.trustLevel);
  const iconUri = shieldIconDataUri(levelColor);
  const brandingRow = opts.showBranding
    ? `<tr><td colspan="3" style="padding:2px 12px 6px 12px;font-size:9px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Protected by <a href="https://qshield.io/download" style="color:#94a3b8;text-decoration:none;font-weight:600;">QShield</a> &mdash; <a href="https://qshield.io/download" style="color:#0ea5e9;text-decoration:none;">protect your emails too</a></td></tr>`
    : '';

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:8px 0;">
  <tr>
    <td style="background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid ${levelColor};border-radius:6px;overflow:hidden;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:8px 8px 8px 12px;vertical-align:middle;"><img src="${iconUri}" width="16" height="19" alt="QShield" style="display:block;"/></td>
          <td style="padding:8px 4px 8px 4px;vertical-align:middle;">
            <a href="${escapeHtml(opts.verifyUrl)}" style="font-size:12px;color:#1e293b;text-decoration:none;font-weight:500;">Verify this email arrived safely&nbsp;&#8599;</a>
            <span style="font-size:11px;font-weight:700;color:${levelColor};margin-left:6px;">Score:&nbsp;${opts.trustScore}</span>
          </td>
          <td style="padding:8px 12px 8px 8px;vertical-align:middle;">
            <a href="${escapeHtml(opts.verifyUrl)}" style="display:inline-block;background:${levelColor};color:#fff;font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;text-decoration:none;">Verify</a>
          </td>
        </tr>
        ${brandingRow}
      </table>
    </td>
  </tr>
</table>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateSignatureHTML(
  config: SignatureConfig,
  trustScore: number,
  verificationId: string = '',
  verifyUrl: string = '',
  referralId: string = '',
  sender: string = 'user@qshield.io',
): SignatureResult {
  const generatedAt = new Date().toISOString();
  const trustLevel = getLevelFromScore(trustScore);
  const verificationHash = generateVerificationHash(generatedAt, trustScore, sender);

  // Fallback URLs if no verification record was created
  const effectiveVerifyUrl = verifyUrl || `https://verify.qshield.io/v/${verificationHash.slice(0, 12)}`;
  const effectiveVerificationId = verificationId || verificationHash.slice(0, 12);
  const effectiveReferralId = referralId || verificationHash.slice(0, 16);

  let html: string;
  switch (config.style) {
    case 'banner':
      html = buildBannerSignature(config, trustScore, trustLevel, effectiveVerifyUrl, generatedAt, effectiveReferralId);
      break;
    case 'minimal':
      html = buildMinimalSignature(config, trustScore, trustLevel, effectiveVerifyUrl, generatedAt, effectiveReferralId);
      break;
    case 'inline':
    default:
      html = buildInlineSignature(config, trustScore, trustLevel, effectiveVerifyUrl, generatedAt, effectiveReferralId);
      break;
  }

  return {
    html,
    trustScore,
    trustLevel,
    verificationHash,
    verificationId: effectiveVerificationId,
    verifyUrl: effectiveVerifyUrl,
    generatedAt,
  };
}
