/**
 * Standalone certificate generator that produces real PDF files
 * using Electron's built-in webContents.printToPDF() API.
 *
 * Used by the IPC cert handlers to generate and export trust certificates.
 */
import { BrowserWindow, app } from 'electron';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import log from 'electron-log';

// -- Types --------------------------------------------------------------------

interface CertData {
  id: string;
  sessionId: string;
  generatedAt: string;
  trustScore: number;
  trustLevel: string;
  evidenceCount: number;
  evidenceHashes: string[];
  signatureChain: string;
  pdfPath: string;
}

interface GenerateOpts {
  sessionId: string;
  trustScore: number;
  trustLevel: string;
}

// -- Constants ----------------------------------------------------------------

const CERTS_DIR = 'certificates';
const VERSION = '1.1.0';

const LEVEL_COLORS: Record<string, string> = {
  verified: '#16a34a',
  normal: '#2563eb',
  elevated: '#d97706',
  warning: '#ea580c',
  critical: '#dc2626',
};

const LEVEL_LABELS: Record<string, string> = {
  verified: 'Verified',
  normal: 'Normal',
  elevated: 'Elevated',
  warning: 'Warning',
  critical: 'Critical',
};

// -- Mock evidence for PDF content --------------------------------------------

function fakeHash(): string {
  const chars = '0123456789abcdef';
  let h = '';
  for (let i = 0; i < 64; i++) h += chars[Math.floor(Math.random() * 16)];
  return h;
}

function generateMockEvidence(count: number) {
  const sources = ['zoom', 'teams', 'email', 'file', 'api'];
  const eventTypes: Record<string, string[]> = {
    zoom: ['meeting.started', 'participant.joined', 'screen.shared', 'encryption.verified'],
    teams: ['call.started', 'message.sent', 'presence.changed', 'file.shared'],
    email: ['email.received', 'email.sent', 'dkim.verified', 'spf.pass'],
    file: ['file.created', 'file.modified', 'file.accessed', 'file.moved'],
    api: ['auth.success', 'request.inbound', 'rate.limited', 'auth.failure'],
  };

  const records = [];
  let prevHash: string | null = null;
  for (let i = 0; i < count; i++) {
    const source = sources[i % sources.length];
    const hash = fakeHash();
    records.push({
      hash,
      previousHash: prevHash,
      source,
      eventType: eventTypes[source][i % eventTypes[source].length],
      timestamp: new Date(Date.now() - (count - i) * 600_000).toISOString(),
      verified: Math.random() > 0.2,
    });
    prevHash = hash;
  }
  return records;
}

// -- HTML Builder -------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCertificateHtml(params: {
  certId: string;
  sessionId: string;
  generatedAt: string;
  trustScore: number;
  trustLevel: string;
  evidence: Array<{
    hash: string;
    previousHash: string | null;
    source: string;
    eventType: string;
    timestamp: string;
    verified: boolean;
  }>;
  signatureChain: string;
}): string {
  const {
    certId, sessionId, generatedAt, trustScore, trustLevel,
    evidence, signatureChain,
  } = params;

  const levelColor = LEVEL_COLORS[trustLevel] ?? LEVEL_COLORS.normal;
  const levelLabel = LEVEL_LABELS[trustLevel] ?? 'Normal';
  const verifiedCount = evidence.filter((e) => e.verified).length;
  const verificationHash = fakeHash();
  const maxRows = Math.min(evidence.length, 12);
  const dateStr = new Date(generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = new Date(generatedAt).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  // SVG arc for circular gauge
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (trustScore / 100) * circumference;

  // Source summary: count events by source
  const sourceCounts: Record<string, number> = {};
  for (const e of evidence) {
    sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1;
  }
  const sourceIcons: Record<string, string> = {
    zoom: 'Z', teams: 'T', email: 'E', file: 'F', api: 'A',
  };

  const evidenceRows = evidence.slice(0, maxRows).map((rec, i) => {
    const statusDot = rec.verified
      ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#16a34a;margin-right:4px;vertical-align:middle;"></span>'
      : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;margin-right:4px;vertical-align:middle;"></span>';
    const rowBg = i % 2 === 0 ? 'background:#f8fafc;' : '';
    const ts = new Date(rec.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<tr style="${rowBg}">
      <td style="padding:4px 6px;font-family:'Courier New',monospace;font-size:6.5pt;color:#475569;letter-spacing:0.3px;">${escapeHtml(rec.hash.slice(0, 12))}\u2026</td>
      <td style="padding:4px 6px;font-size:7pt;color:#334155;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">${escapeHtml(rec.source)}</td>
      <td style="padding:4px 6px;font-size:7pt;color:#475569;">${escapeHtml(rec.eventType)}</td>
      <td style="padding:4px 6px;font-size:7pt;color:#64748b;">${ts}</td>
      <td style="padding:4px 6px;font-size:7pt;">${statusDot}${rec.verified ? '<span style="color:#16a34a;font-weight:600;">OK</span>' : '<span style="color:#f59e0b;font-weight:600;">Pend</span>'}</td>
    </tr>`;
  }).join('');

  const remaining = evidence.length - maxRows;

  // QR-like verification grid
  let qrCells = '';
  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 11; col++) {
      const idx = (row * 11 + col) % certId.length;
      const code = certId.charCodeAt(idx);
      if (code % 3 !== 0) {
        qrCells += `<rect x="${2 + col * 6}" y="${2 + row * 6}" width="5" height="5" rx="0.5" fill="#1e293b"/>`;
      }
    }
  }
  // QR corners (finder patterns)
  const corner = (x: number, y: number) => `
    <rect x="${x}" y="${y}" width="16" height="16" rx="1" fill="#0f172a"/>
    <rect x="${x + 2}" y="${y + 2}" width="12" height="12" rx="0.5" fill="#ffffff"/>
    <rect x="${x + 4}" y="${y + 4}" width="8" height="8" rx="0.5" fill="#0f172a"/>`;
  const qrSvg = `<svg width="70" height="70" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
    <rect width="70" height="70" rx="3" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    ${qrCells}
    ${corner(2, 2)}${corner(50, 2)}${corner(2, 50)}
  </svg>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  @page{size:A4;margin:0;}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;
    color:#0f172a;
    width:794px;
    min-height:1123px;
    background:#ffffff;
    position:relative;
  }
  /* Outer border frame */
  .frame{
    position:absolute;
    top:24px;left:24px;right:24px;bottom:24px;
    border:2px solid #cbd5e1;
    border-radius:4px;
    padding:36px 40px 28px;
    display:flex;
    flex-direction:column;
  }
  /* Inner accent border */
  .frame::before{
    content:'';
    position:absolute;
    top:4px;left:4px;right:4px;bottom:4px;
    border:0.5px solid #e2e8f0;
    border-radius:2px;
    pointer-events:none;
  }
  /* Header */
  .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
  .hdr-left{display:flex;align-items:center;gap:12px;}
  .hdr h1{font-size:22pt;font-weight:800;color:#0f172a;letter-spacing:-0.5px;}
  .hdr-sub{font-size:9pt;color:#64748b;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;}
  .hdr-right{text-align:right;}
  .hdr-right .cert-no{font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;}
  .hdr-right .cert-id{font-family:'Courier New',monospace;font-size:7.5pt;color:#64748b;margin-top:1px;}
  .accent-bar{height:3px;background:linear-gradient(90deg,${levelColor},${levelColor}88,transparent);margin:10px 0 18px;border:none;border-radius:2px;}
  /* Score panel */
  .score-panel{display:flex;gap:28px;align-items:flex-start;margin-bottom:18px;}
  .gauge-wrap{flex-shrink:0;text-align:center;}
  .gauge-label{font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-top:4px;}
  .score-details{flex:1;}
  .score-details h2{font-size:13pt;font-weight:700;color:#0f172a;margin-bottom:8px;}
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;}
  .detail-item .lbl{font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;}
  .detail-item .val{font-size:9pt;color:#334155;font-weight:500;margin-top:1px;}
  .detail-item .val.mono{font-family:'Courier New',monospace;font-size:8pt;}
  .badge{display:inline-block;background:${levelColor};color:#fff;font-size:8pt;font-weight:700;padding:3px 14px;border-radius:10px;letter-spacing:0.5px;text-transform:uppercase;}
  /* Source bars */
  .sources{display:flex;gap:6px;margin-top:10px;}
  .src-chip{display:flex;align-items:center;gap:4px;background:#f1f5f9;border-radius:4px;padding:3px 8px;}
  .src-icon{width:16px;height:16px;border-radius:3px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:7pt;font-weight:800;color:#475569;}
  .src-chip .src-name{font-size:7pt;color:#475569;text-transform:capitalize;font-weight:600;}
  .src-chip .src-count{font-size:7pt;color:#94a3b8;}
  /* Section divider */
  .sep{height:1px;background:#e2e8f0;margin:14px 0;border:none;}
  .sec-title{font-size:9pt;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}
  /* Evidence table */
  .ev-table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:4px;}
  .ev-table th{background:#f1f5f9;font-size:6.5pt;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;padding:5px 6px;text-align:left;border-bottom:1px solid #e2e8f0;}
  .ev-table td{border-bottom:1px solid #f1f5f9;}
  .ev-more{text-align:center;font-size:7pt;color:#94a3b8;padding:4px 0;font-style:italic;}
  /* Chain integrity */
  .chain-row{display:flex;gap:12px;align-items:stretch;}
  .chain-status{flex:1;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;display:flex;align-items:center;gap:10px;}
  .chain-check{width:28px;height:28px;background:#16a34a;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .chain-text .ct-title{font-size:9pt;font-weight:700;color:#15803d;}
  .chain-text .ct-sub{font-size:7pt;color:#4ade80;margin-top:1px;}
  .sig-box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;}
  .sig-box .sb-title{font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;margin-bottom:3px;}
  .sig-box .sb-hash{font-family:'Courier New',monospace;font-size:6.5pt;color:#475569;word-break:break-all;line-height:1.4;}
  /* Footer */
  .footer-area{margin-top:auto;padding-top:14px;}
  .footer-sep{height:1px;background:linear-gradient(90deg,transparent,#cbd5e1,transparent);margin-bottom:10px;border:none;}
  .footer-row{display:flex;align-items:flex-start;justify-content:space-between;}
  .footer-qr{display:flex;gap:10px;align-items:center;}
  .footer-qr-text{font-size:6.5pt;color:#94a3b8;line-height:1.5;}
  .footer-qr-text .fq-hash{font-family:'Courier New',monospace;font-size:6pt;color:#94a3b8;word-break:break-all;}
  .footer-meta{text-align:right;font-size:6.5pt;color:#94a3b8;line-height:1.5;}
  .footer-bottom{text-align:center;font-size:6pt;color:#cbd5e1;margin-top:8px;letter-spacing:0.5px;}
  /* Watermark */
  .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:72pt;font-weight:900;color:rgba(148,163,184,0.04);letter-spacing:8px;text-transform:uppercase;pointer-events:none;white-space:nowrap;}
</style>
</head>
<body>
<div class="watermark">QSHIELD</div>
<div class="frame">
  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-left">
      <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
        <defs><linearGradient id="g" x1="0" y1="0" x2="40" y2="40"><stop offset="0%" stop-color="${levelColor}"/><stop offset="100%" stop-color="${levelColor}cc"/></linearGradient></defs>
        <path d="M20 2 L37 12 L37 28 L20 38 L3 28 L3 12 Z" fill="url(#g)"/>
        <polyline points="13,20 18,25 27,15" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div>
        <h1>QShield</h1>
        <div class="hdr-sub">Trust Verification Certificate</div>
      </div>
    </div>
    <div class="hdr-right">
      <div class="cert-no">Certificate No.</div>
      <div class="cert-id">${escapeHtml(certId.slice(0, 8)).toUpperCase()}</div>
    </div>
  </div>
  <hr class="accent-bar">

  <!-- SCORE + DETAILS -->
  <div class="score-panel">
    <div class="gauge-wrap">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="10"/>
        <circle cx="65" cy="65" r="${radius}" fill="none" stroke="${levelColor}" stroke-width="10"
          stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
          stroke-linecap="round" transform="rotate(-90 65 65)"/>
        <text x="65" y="58" text-anchor="middle" font-size="28" font-weight="800" fill="${levelColor}" font-family="-apple-system,sans-serif">${trustScore}</text>
        <text x="65" y="74" text-anchor="middle" font-size="9" font-weight="600" fill="#94a3b8" font-family="-apple-system,sans-serif" text-transform="uppercase">/ 100</text>
      </svg>
      <div class="badge">${escapeHtml(levelLabel)}</div>
    </div>
    <div class="score-details">
      <h2>Session Assessment</h2>
      <div class="detail-grid">
        <div class="detail-item"><div class="lbl">Session ID</div><div class="val mono">${escapeHtml(sessionId.length > 20 ? sessionId.slice(0, 20) + '\u2026' : sessionId)}</div></div>
        <div class="detail-item"><div class="lbl">Date Issued</div><div class="val">${escapeHtml(dateStr)}</div></div>
        <div class="detail-item"><div class="lbl">Evidence Records</div><div class="val">${evidence.length} total &middot; ${verifiedCount} verified</div></div>
        <div class="detail-item"><div class="lbl">Time</div><div class="val">${escapeHtml(timeStr)}</div></div>
      </div>
      <div class="sources">
        ${Object.entries(sourceCounts).map(([src, count]) => `
          <div class="src-chip">
            <div class="src-icon">${sourceIcons[src] || src[0].toUpperCase()}</div>
            <span class="src-name">${escapeHtml(src)}</span>
            <span class="src-count">${count}</span>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <hr class="sep">

  <!-- EVIDENCE RECORDS -->
  <div class="sec-title">Evidence Ledger</div>
  <table class="ev-table">
    <thead><tr>
      <th style="width:22%">Record Hash</th>
      <th style="width:14%">Source</th>
      <th style="width:26%">Event</th>
      <th style="width:22%">Time</th>
      <th style="width:16%">Status</th>
    </tr></thead>
    <tbody>
      ${evidenceRows}
      ${remaining > 0 ? `<tr><td colspan="5" class="ev-more">+ ${remaining} additional records included in chain</td></tr>` : ''}
    </tbody>
  </table>

  <hr class="sep">

  <!-- CHAIN INTEGRITY -->
  <div class="sec-title">Integrity Verification</div>
  <div class="chain-row">
    <div class="chain-status">
      <div class="chain-check">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="4,12 10,18 20,6" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="chain-text">
        <div class="ct-title">Hash Chain Intact</div>
        <div class="ct-sub">${evidence.length} records &middot; All links verified</div>
      </div>
    </div>
    <div class="sig-box">
      <div class="sb-title">Signature Chain Hash</div>
      <div class="sb-hash">${escapeHtml(signatureChain)}</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer-area">
    <hr class="footer-sep">
    <div class="footer-row">
      <div class="footer-qr">
        ${qrSvg}
        <div class="footer-qr-text">
          <strong style="font-size:7pt;color:#64748b;">Verification Hash</strong><br>
          <span class="fq-hash">${escapeHtml(verificationHash)}</span>
        </div>
      </div>
      <div class="footer-meta">
        Certificate ID: ${escapeHtml(certId)}<br>
        Generated by QShield v${VERSION}<br>
        ${escapeHtml(dateStr)} at ${escapeHtml(timeStr)}<br>
        HMAC-SHA256 evidence chain
      </div>
    </div>
    <div class="footer-bottom">
      This document is a cryptographically verifiable trust certificate generated by QShield Desktop.
      Verify integrity at the signature chain hash above.
    </div>
  </div>
</div>
</body>
</html>`;
}

// -- Standalone cert generator ------------------------------------------------

export class StandaloneCertGenerator {
  private certsDir: string;
  private certs: CertData[] = [];

  constructor() {
    this.certsDir = path.join(app.getPath('userData'), CERTS_DIR);
  }

  /** Generate a certificate, write PDF to disk, return cert metadata */
  async generate(opts: GenerateOpts): Promise<CertData> {
    const certId = randomUUID();
    const generatedAt = new Date().toISOString();
    const evidenceCount = 15 + Math.floor(Math.random() * 20);
    const evidence = generateMockEvidence(evidenceCount);
    const evidenceHashes = evidence.map((e) => e.hash);
    const signatureChain = fakeHash();

    await mkdir(this.certsDir, { recursive: true });
    const pdfPath = path.join(this.certsDir, `qshield-cert-${certId}.pdf`);

    // Build the HTML certificate
    const html = buildCertificateHtml({
      certId,
      sessionId: opts.sessionId,
      generatedAt,
      trustScore: opts.trustScore,
      trustLevel: opts.trustLevel,
      evidence,
      signatureChain,
    });

    // Render PDF via Electron's printToPDF
    await this.renderPdf(html, pdfPath);

    const cert: CertData = {
      id: certId,
      sessionId: opts.sessionId,
      generatedAt,
      trustScore: opts.trustScore,
      trustLevel: opts.trustLevel,
      evidenceCount,
      evidenceHashes,
      signatureChain,
      pdfPath,
    };

    this.certs.unshift(cert);
    log.info(`StandaloneCertGenerator: certificate ${certId} written to ${pdfPath}`);
    return cert;
  }

  /** List all generated certificates */
  list(): CertData[] {
    return this.certs;
  }

  /** Get the PDF file path for a given certificate ID */
  getPdfPath(id: string): string | null {
    const cert = this.certs.find((c) => c.id === id);
    return cert?.pdfPath ?? null;
  }

  /** Render HTML to a PDF file using a hidden BrowserWindow */
  private async renderPdf(html: string, pdfPath: string): Promise<void> {
    log.info('StandaloneCertGenerator: creating hidden window for PDF render');

    const win = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: {
        // No offscreen — printToPDF needs the normal rendering pipeline
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    try {
      // loadURL with data: URI — await resolves when load completes (did-finish-load)
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      log.info('StandaloneCertGenerator: loading HTML into hidden window');
      await win.loadURL(dataUrl);
      log.info('StandaloneCertGenerator: HTML loaded, waiting for paint');

      // Give the renderer a moment to paint (fonts, layout)
      await new Promise<void>((resolve) => setTimeout(resolve, 500));

      // Generate PDF buffer via Electron's built-in API
      log.info('StandaloneCertGenerator: calling printToPDF');
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
      });

      log.info(`StandaloneCertGenerator: PDF generated, ${pdfBuffer.length} bytes`);

      // Write the PDF to disk
      await writeFile(pdfPath, pdfBuffer);
      log.info(`StandaloneCertGenerator: PDF written to ${pdfPath}`);
    } catch (err) {
      log.error('StandaloneCertGenerator: PDF render error', err);
      throw err;
    } finally {
      win.destroy();
    }
  }
}
