/**
 * Trust Report PDF generator.
 * Produces professional multi-page PDF reports using Electron's printToPDF().
 * Reports show plain-English summaries instead of raw hashes.
 */
import { BrowserWindow, app } from 'electron';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import type { TrustReport } from '@qshield/core';

const REPORTS_DIR = 'reports';
const VERSION = '1.1.0';

const LEVEL_COLORS: Record<string, string> = {
  verified: '#16a34a',
  normal: '#2563eb',
  elevated: '#d97706',
  warning: '#ea580c',
  critical: '#dc2626',
};

const GRADE_COLORS: Record<string, string> = {
  'A+': '#16a34a', 'A': '#16a34a', 'A-': '#16a34a',
  'B+': '#2563eb', 'B': '#2563eb', 'B-': '#2563eb',
  'C+': '#d97706', 'C': '#d97706',
  'D': '#ea580c',
  'F': '#dc2626',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    + ' at '
    + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

interface RecentEvent {
  timestamp: string;
  description: string;
  verified: boolean;
}

interface AnomalyEntry {
  timestamp: string;
  description: string;
  status: string;
}

export interface ReportPdfData {
  report: TrustReport;
  recentEvents: RecentEvent[];
  anomalies: AnomalyEntry[];
}

function buildReportHtml(data: ReportPdfData): string {
  const { report, recentEvents, anomalies } = data;

  const levelColor = LEVEL_COLORS[report.trustLevel] ?? LEVEL_COLORS.normal;
  const gradeColor = GRADE_COLORS[report.trustGrade] ?? LEVEL_COLORS.normal;

  const typeLabel = report.type === 'snapshot' ? 'Trust Snapshot'
    : report.type === 'period' ? 'Period Assessment'
    : 'Asset Assessment';

  const periodLabel = report.fromDate === report.toDate
    ? formatDate(report.fromDate)
    : `${formatDate(report.fromDate)} \u2013 ${formatDate(report.toDate)}`;

  // Score gauge SVG
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (report.trustScore / 100) * circumference;

  // Category bar helper
  const categoryBar = (label: string, icon: string, score: number, details: string[]) => {
    const barColor = score >= 90 ? '#16a34a' : score >= 70 ? '#2563eb' : score >= 50 ? '#d97706' : score >= 30 ? '#ea580c' : '#dc2626';
    const detailsHtml = details.map(d => `<div style="font-size:7pt;color:#64748b;margin-top:1px;">${escapeHtml(d)}</div>`).join('');
    return `
      <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="font-size:12pt;">${icon}</span>
          <span style="font-size:8pt;font-weight:700;color:#334155;">${escapeHtml(label)}</span>
          <span style="margin-left:auto;font-size:11pt;font-weight:800;color:${barColor};">${Math.round(score)}</span>
          <span style="font-size:7pt;color:#94a3b8;">/ 100</span>
        </div>
        <div style="height:3px;background:#e2e8f0;border-radius:2px;margin-bottom:6px;">
          <div style="height:100%;width:${Math.min(100, score)}%;background:${barColor};border-radius:2px;"></div>
        </div>
        ${detailsHtml}
      </div>`;
  };

  // Recent events rows
  const eventRows = recentEvents.slice(0, 6).map(e => {
    const ts = new Date(e.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const check = e.verified ? '<span style="color:#16a34a;font-weight:600;">verified &#x2713;</span>' : '<span style="color:#64748b;">recorded</span>';
    return `<div style="display:flex;align-items:baseline;gap:8px;padding:3px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:7pt;color:#94a3b8;white-space:nowrap;min-width:100px;">${escapeHtml(ts)}</span>
      <span style="font-size:7.5pt;color:#334155;flex:1;">${escapeHtml(e.description)}</span>
      <span style="font-size:7pt;">${check}</span>
    </div>`;
  }).join('');

  // Anomaly rows
  const anomalyRows = anomalies.slice(0, 4).map(a => {
    const ts = new Date(a.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const statusColor = a.status.toLowerCase().includes('resolved') ? '#16a34a' : '#d97706';
    return `<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;">
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span style="font-size:7pt;color:#94a3b8;white-space:nowrap;min-width:100px;">${escapeHtml(ts)}</span>
        <span style="font-size:7.5pt;color:#334155;flex:1;">${escapeHtml(a.description)}</span>
      </div>
      <div style="font-size:7pt;color:${statusColor};margin-left:108px;margin-top:1px;">Status: ${escapeHtml(a.status)}</div>
    </div>`;
  }).join('');

  const reportIdShort = `RPT-${report.id.slice(0, 8).toUpperCase()}`;

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
  .frame{
    position:absolute;
    top:24px;left:24px;right:24px;bottom:24px;
    border:2px solid #cbd5e1;
    border-radius:4px;
    padding:32px 36px 24px;
    display:flex;
    flex-direction:column;
  }
  .frame::before{
    content:'';
    position:absolute;
    top:4px;left:4px;right:4px;bottom:4px;
    border:0.5px solid #e2e8f0;
    border-radius:2px;
    pointer-events:none;
  }
  .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:72pt;font-weight:900;color:rgba(148,163,184,0.03);letter-spacing:8px;text-transform:uppercase;pointer-events:none;white-space:nowrap;}
  .sep{height:1px;background:#e2e8f0;margin:12px 0;border:none;}
  .sec-title{font-size:9pt;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}
</style>
</head>
<body>
<div class="watermark">QSHIELD</div>
<div class="frame">

  <!-- HEADER -->
  <div style="text-align:center;margin-bottom:6px;">
    <svg width="32" height="32" viewBox="0 0 40 40" fill="none" style="margin-bottom:4px;">
      <defs><linearGradient id="g" x1="0" y1="0" x2="40" y2="40"><stop offset="0%" stop-color="${levelColor}"/><stop offset="100%" stop-color="${levelColor}cc"/></linearGradient></defs>
      <path d="M20 2 L37 12 L37 28 L20 38 L3 28 L3 12 Z" fill="url(#g)"/>
      <polyline points="13,20 18,25 27,15" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div style="font-size:20pt;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">QShield</div>
    <div style="font-size:10pt;color:#64748b;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;">Trust Verification Report</div>
  </div>
  <hr style="height:3px;background:linear-gradient(90deg,${levelColor},${levelColor}88,transparent);margin:8px 0 14px;border:none;border-radius:2px;">

  <!-- REPORT META -->
  <div style="display:flex;justify-content:space-between;margin-bottom:14px;">
    <div>
      <div style="font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Report Type</div>
      <div style="font-size:9pt;color:#334155;font-weight:600;margin-top:1px;">${escapeHtml(typeLabel)}</div>
    </div>
    <div>
      <div style="font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Period</div>
      <div style="font-size:9pt;color:#334155;font-weight:600;margin-top:1px;">${escapeHtml(periodLabel)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Generated</div>
      <div style="font-size:9pt;color:#334155;font-weight:600;margin-top:1px;">${escapeHtml(formatDateTime(report.generatedAt))}</div>
    </div>
  </div>

  <!-- SCORE BOX -->
  <div style="display:flex;gap:20px;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 24px;margin-bottom:14px;">
    <div style="text-align:center;flex-shrink:0;">
      <svg width="120" height="120" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="9"/>
        <circle cx="65" cy="65" r="${radius}" fill="none" stroke="${levelColor}" stroke-width="9"
          stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
          stroke-linecap="round" transform="rotate(-90 65 65)"/>
        <text x="65" y="58" text-anchor="middle" font-size="26" font-weight="800" fill="${levelColor}" font-family="-apple-system,sans-serif">${Math.round(report.trustScore)}</text>
        <text x="65" y="73" text-anchor="middle" font-size="9" font-weight="600" fill="#94a3b8" font-family="-apple-system,sans-serif">/ 100</text>
      </svg>
    </div>
    <div style="flex:1;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="font-size:32pt;font-weight:900;color:${gradeColor};line-height:1;">${escapeHtml(report.trustGrade)}</span>
        <div>
          <div style="font-size:8pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Trust Grade</div>
          <div style="display:inline-block;background:${levelColor};color:#fff;font-size:7pt;font-weight:700;padding:2px 10px;border-radius:8px;letter-spacing:0.5px;text-transform:uppercase;margin-top:2px;">
            ${escapeHtml(report.trustLevel)}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- MONITORING SUMMARY -->
  <div class="sec-title">Monitoring Summary</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:7.5pt;color:#64748b;">Channels Monitored</span>
      <span style="font-size:8pt;font-weight:600;color:#334155;">${report.channelsMonitored} of 6</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:7.5pt;color:#64748b;">High-Trust Assets</span>
      <span style="font-size:8pt;font-weight:600;color:#334155;">${report.assetsMonitored} protected</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:7.5pt;color:#64748b;">Total Events Recorded</span>
      <span style="font-size:8pt;font-weight:600;color:#334155;">${report.totalEvents.toLocaleString()}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:7.5pt;color:#64748b;">Anomalies Detected</span>
      <span style="font-size:8pt;font-weight:600;color:#334155;">${report.anomaliesDetected}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:7.5pt;color:#64748b;">Anomalies Resolved</span>
      <span style="font-size:8pt;font-weight:600;color:${report.anomaliesResolved >= report.anomaliesDetected ? '#16a34a' : '#d97706'};">${report.anomaliesResolved} of ${report.anomaliesDetected} (${report.anomaliesDetected === 0 ? '100' : Math.round((report.anomaliesResolved / report.anomaliesDetected) * 100)}%)</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:7.5pt;color:#64748b;">Evidence Chain</span>
      <span style="font-size:8pt;font-weight:600;color:${report.chainIntegrity ? '#16a34a' : '#dc2626'};">${report.chainIntegrity ? 'Intact \u2713' : 'Broken \u2717'}</span>
    </div>
  </div>

  <!-- CATEGORY ASSESSMENT -->
  <div class="sec-title">Category Assessment</div>
  <div style="display:flex;gap:8px;margin-bottom:14px;">
    ${categoryBar('Email Security', '\ud83d\udce7', report.emailScore, [])}
    ${categoryBar('File Integrity', '\ud83d\udcc1', report.fileScore, [])}
    ${categoryBar('Meeting Security', '\ud83d\udcf9', report.meetingScore, [])}
    ${categoryBar('Asset Protection', '\ud83d\udee1\ufe0f', report.assetScore, [])}
  </div>

  <hr class="sep">

  <!-- EVIDENCE HIGHLIGHTS -->
  <div class="sec-title">Evidence Highlights</div>
  <div style="margin-bottom:10px;">
    ${eventRows || '<div style="font-size:7.5pt;color:#94a3b8;padding:4px 0;">No recent events recorded.</div>'}
  </div>

  ${anomalies.length > 0 ? `
  <div style="font-size:8pt;font-weight:700;color:#0f172a;margin-bottom:4px;">Anomaly Log</div>
  <div style="margin-bottom:10px;">
    ${anomalyRows}
  </div>` : ''}

  <!-- VERIFICATION FOOTER -->
  <div style="margin-top:auto;padding-top:10px;">
    <hr style="height:1px;background:linear-gradient(90deg,transparent,#cbd5e1,transparent);margin-bottom:10px;border:none;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:8pt;font-weight:700;color:#334155;">Verification</div>
        <div style="font-size:7pt;color:#64748b;margin-top:2px;">Evidence chain: ${report.evidenceCount.toLocaleString()} cryptographically linked records</div>
        <div style="font-size:7pt;color:#64748b;">Chain integrity: <span style="color:${report.chainIntegrity ? '#16a34a' : '#dc2626'};font-weight:600;">${report.chainIntegrity ? 'Verified \u2713' : 'Failed \u2717'}</span></div>
        <div style="font-size:7pt;color:#64748b;">Signature: HMAC-SHA256</div>
        <div style="font-size:7pt;color:#64748b;">Report ID: <span style="font-family:'Courier New',monospace;">${escapeHtml(reportIdShort)}</span></div>
      </div>
      <div style="text-align:right;font-size:6.5pt;color:#94a3b8;line-height:1.5;">
        Generated by QShield v${VERSION}<br>
        ${escapeHtml(formatDateTime(report.generatedAt))}<br>
        HMAC-SHA256 evidence chain
      </div>
    </div>
    <div style="text-align:center;font-size:6pt;color:#cbd5e1;margin-top:8px;letter-spacing:0.5px;">
      This report was generated by QShield Trust Monitor. It contains a cryptographically verifiable summary of monitored data security events.
    </div>
  </div>

</div>
</body>
</html>`;
}

// -- Report generator class ---------------------------------------------------

export class TrustReportGenerator {
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.join(app.getPath('userData'), REPORTS_DIR);
  }

  /** Render a report to a PDF file on disk. Returns the PDF file path. */
  async generatePdf(data: ReportPdfData): Promise<string> {
    await mkdir(this.reportsDir, { recursive: true });
    const pdfPath = path.join(this.reportsDir, `qshield-report-${data.report.id}.pdf`);

    const html = buildReportHtml(data);
    await this.renderPdf(html, pdfPath);

    log.info(`[TrustReportGenerator] Report ${data.report.id} PDF written to ${pdfPath}`);
    return pdfPath;
  }

  private async renderPdf(html: string, pdfPath: string): Promise<void> {
    const win = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    try {
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      await win.loadURL(dataUrl);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));

      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });

      await writeFile(pdfPath, pdfBuffer);
    } finally {
      win.destroy();
    }
  }
}
