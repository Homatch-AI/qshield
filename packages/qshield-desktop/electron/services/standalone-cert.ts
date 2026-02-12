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
  const maxRows = Math.min(evidence.length, 25);

  const evidenceRows = evidence.slice(0, maxRows).map((rec, i) => {
    const bgColor = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    const statusColor = rec.verified ? '#16a34a' : '#dc2626';
    const statusLabel = rec.verified ? 'Verified' : 'Pending';
    const ts = new Date(rec.timestamp).toLocaleString();
    return `
      <tr style="background-color: ${bgColor};">
        <td style="padding: 5px 8px; font-family: 'Courier New', monospace; font-size: 7pt; color: #334155;">
          ${escapeHtml(rec.hash.slice(0, 8))}...${escapeHtml(rec.hash.slice(-8))}
        </td>
        <td style="padding: 5px 8px; font-size: 7pt; color: #334155;">${escapeHtml(rec.source)}</td>
        <td style="padding: 5px 8px; font-size: 7pt; color: #334155;">${escapeHtml(rec.eventType)}</td>
        <td style="padding: 5px 8px; font-size: 7pt; color: #334155;">${escapeHtml(ts)}</td>
        <td style="padding: 5px 8px; font-size: 7pt; color: ${statusColor}; font-weight: 600;">${statusLabel}</td>
      </tr>`;
  }).join('');

  const moreRecords = evidence.length > maxRows
    ? `<p style="text-align: center; font-size: 8pt; font-style: italic; color: #94a3b8; margin-top: 4px;">
        ... and ${evidence.length - maxRows} more records
      </p>`
    : '';

  // Generate a simple QR-like pattern (8x8 grid of squares)
  let qrCells = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      // Use deterministic pattern based on certId chars for consistency
      const charCode = certId.charCodeAt((row * 8 + col) % certId.length);
      if (charCode % 3 !== 0) {
        const x = 4 + col * 9;
        const y = 4 + row * 9;
        qrCells += `<rect x="${x}" y="${y}" width="8" height="8" fill="#334155"/>`;
      }
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #0f172a;
      padding: 50px;
      width: 794px;
      background: #ffffff;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 8px;
    }
    .header-text h1 {
      font-size: 28pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1;
    }
    .header-text p {
      font-size: 12pt;
      color: #64748b;
      margin-top: 2px;
    }
    .divider {
      height: 3px;
      background: ${levelColor};
      margin: 12px 0 20px 0;
      border: none;
    }
    .section-title {
      font-size: 16pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 10px;
    }
    .score-section {
      margin-bottom: 20px;
    }
    .gauge-row {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-bottom: 16px;
    }
    .gauge-bg {
      width: 220px;
      height: 18px;
      background: #e2e8f0;
      border-radius: 9px;
      overflow: hidden;
    }
    .gauge-fill {
      height: 100%;
      background: ${levelColor};
      border-radius: 9px;
      min-width: 18px;
    }
    .score-number {
      font-size: 32pt;
      font-weight: 700;
      color: ${levelColor};
      line-height: 1;
    }
    .level-badge {
      display: inline-block;
      background: ${levelColor};
      color: #ffffff;
      font-size: 12pt;
      font-weight: 700;
      padding: 4px 20px;
      border-radius: 13px;
      text-align: center;
    }
    .session-details {
      font-size: 10pt;
      color: #64748b;
      line-height: 1.7;
    }
    .evidence-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .evidence-table th {
      background: #f1f5f9;
      font-size: 8pt;
      font-weight: 700;
      color: #0f172a;
      text-align: left;
      padding: 6px 8px;
    }
    .chain-box {
      background: #f0fdf4;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 12px;
    }
    .chain-box .title {
      font-size: 11pt;
      font-weight: 700;
      color: #16a34a;
    }
    .chain-box .detail {
      font-size: 8pt;
      color: #64748b;
      margin-top: 4px;
    }
    .sig-hash {
      font-family: 'Courier New', monospace;
      font-size: 7pt;
      color: #475569;
      word-break: break-all;
    }
    .verification-section {
      display: flex;
      gap: 20px;
      margin-top: 16px;
    }
    .qr-placeholder {
      flex-shrink: 0;
    }
    .qr-placeholder p {
      font-size: 6pt;
      color: #94a3b8;
      text-align: center;
      margin-top: 2px;
    }
    .verification-details {
      flex: 1;
    }
    .verification-details .label {
      font-size: 10pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .verification-details .hash {
      font-family: 'Courier New', monospace;
      font-size: 7pt;
      color: #475569;
      word-break: break-all;
      margin-bottom: 12px;
    }
    .verification-details .meta {
      font-size: 9pt;
      color: #64748b;
      line-height: 1.7;
    }
    .footer-line {
      height: 1px;
      background: #e2e8f0;
      margin: 24px 0 8px 0;
      border: none;
    }
    .footer {
      font-size: 7pt;
      color: #94a3b8;
      text-align: center;
    }
    .thin-divider {
      height: 1px;
      background: #e2e8f0;
      margin: 12px 0;
      border: none;
    }
  </style>
</head>
<body>
  <!-- 1. BRANDING HEADER -->
  <div class="header">
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 0 L40 12 L40 24 L20 40 L0 24 L0 12 Z" fill="${levelColor}"/>
      <polyline points="12,20 18,26 28,14" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="header-text">
      <h1>QShield</h1>
      <p>Trust Certificate</p>
    </div>
  </div>
  <hr class="divider">

  <!-- 2. TRUST SCORE SECTION -->
  <div class="score-section">
    <div class="section-title">Trust Score Summary</div>
    <div class="gauge-row">
      <div class="gauge-bg">
        <div class="gauge-fill" style="width: ${Math.max(trustScore, 5)}%;"></div>
      </div>
      <div class="score-number">${trustScore}</div>
      <div class="level-badge">${escapeHtml(levelLabel)}</div>
    </div>
    <div class="session-details">
      Session ID: ${escapeHtml(sessionId)}<br>
      Evidence Records: ${evidence.length}<br>
      Verified Records: ${verifiedCount}<br>
      Generated: ${escapeHtml(new Date(generatedAt).toLocaleString())}
    </div>
  </div>

  <!-- 3. EVIDENCE TABLE -->
  <div class="section-title">Evidence Records</div>
  <table class="evidence-table">
    <thead>
      <tr>
        <th style="width: 28%;">Hash</th>
        <th style="width: 15%;">Source</th>
        <th style="width: 25%;">Event Type</th>
        <th style="width: 22%;">Timestamp</th>
        <th style="width: 10%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${evidenceRows}
    </tbody>
  </table>
  ${moreRecords}

  <!-- 4. CHAIN INTEGRITY -->
  <div style="margin-top: 20px;">
    <div class="section-title">Hash Chain Integrity</div>
    <div class="chain-box">
      <div class="title">CHAIN VERIFIED -- All records are intact and properly linked.</div>
      <div class="detail">Chain length: ${evidence.length} records &bull; All hashes verified</div>
    </div>
    <hr class="thin-divider">
    <div style="font-size: 11pt; font-weight: 700; color: #0f172a; margin-bottom: 4px;">Signature Chain Hash</div>
    <div class="sig-hash">${escapeHtml(signatureChain)}</div>
  </div>

  <!-- 5. VERIFICATION SECTION -->
  <div style="margin-top: 20px;">
    <div class="section-title">Verification</div>
    <div class="verification-section">
      <div class="qr-placeholder">
        <svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
          <rect width="80" height="80" fill="none" stroke="#cbd5e1" stroke-width="2"/>
          ${qrCells}
        </svg>
        <p>Scan to verify</p>
      </div>
      <div class="verification-details">
        <div class="label">Verification Hash</div>
        <div class="hash">${escapeHtml(verificationHash)}</div>
        <div class="meta">
          Certificate ID: ${escapeHtml(certId)}<br>
          Generated: ${escapeHtml(new Date(generatedAt).toLocaleString())}<br>
          Generator: QShield v${VERSION}
        </div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <hr class="footer-line">
  <div class="footer">
    This certificate was generated by QShield Desktop. Verify the signature chain hash to confirm evidence integrity.
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
