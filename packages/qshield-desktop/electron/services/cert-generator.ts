import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import {
  computeSignatureChain,
  computeTrustLevel,
  getChainIntegrity,
  hmacSha256,
} from '@qshield/core';
import type {
  TrustCertificate,
  TrustLevel,
  EvidenceRecord,
} from '@qshield/core';
import type { EvidenceStore } from './evidence-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CERTS_DIR_NAME = 'certificates';
const GENERATOR_VERSION = '1.1.0';

/** Colour palette keyed by trust level for PDF rendering. */
const LEVEL_COLORS: Record<TrustLevel, string> = {
  verified: '#16a34a',  // green-600
  normal: '#2563eb',    // blue-600
  elevated: '#d97706',  // amber-600
  warning: '#ea580c',   // orange-600
  critical: '#dc2626',  // red-600
};

/** Background tints for trust level badges. */
const LEVEL_BG_COLORS: Record<TrustLevel, string> = {
  verified: '#f0fdf4',
  normal: '#eff6ff',
  elevated: '#fffbeb',
  warning: '#fff7ed',
  critical: '#fef2f2',
};

const LEVEL_LABELS: Record<TrustLevel, string> = {
  verified: 'Verified',
  normal: 'Normal',
  elevated: 'Elevated',
  warning: 'Warning',
  critical: 'Critical',
};

// ---------------------------------------------------------------------------
// CertificateGenerator
// ---------------------------------------------------------------------------

/**
 * Generates professional PDF trust certificates with QShield branding.
 *
 * Features:
 * - QShield branding header with logo placeholder
 * - Trust score gauge drawn with pdfkit shapes
 * - Evidence summary table with hash, source, event type, timestamp
 * - Hash chain integrity statement
 * - Generation metadata (timestamp, version, session ID)
 * - Verification section with QR code placeholder and verification hash
 * - Professional layout with margins, Helvetica fonts, trust-level colors
 */
export class CertificateGenerator {
  private store: EvidenceStore;
  private certsDir: string;

  /**
   * Create a new CertificateGenerator.
   *
   * @param store - The evidence store to read records from
   */
  constructor(store: EvidenceStore) {
    this.store = store;
    this.certsDir = path.join(app.getPath('userData'), CERTS_DIR_NAME);
    log.info(`CertificateGenerator: certificates directory at ${this.certsDir}`);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate a PDF trust certificate for a session.
   *
   * Collects evidence records, computes trust metrics, generates a
   * professional PDF with branding, and persists the certificate to
   * the evidence store.
   *
   * @param opts.sessionId - The session to certify
   * @param opts.evidenceIds - Specific evidence record IDs to include
   * @param opts.includeAllEvidence - When true, include every record in the store
   * @returns The persisted TrustCertificate with the path to the generated PDF
   */
  async generate(opts: {
    sessionId: string;
    evidenceIds?: string[];
    includeAllEvidence?: boolean;
  }): Promise<TrustCertificate> {
    const { sessionId, evidenceIds, includeAllEvidence } = opts;

    // Collect evidence records
    let records: EvidenceRecord[];

    if (evidenceIds && evidenceIds.length > 0) {
      records = this.store.exportRecords(evidenceIds);
    } else if (includeAllEvidence) {
      const result = this.store.listRecords({
        page: 1,
        pageSize: 100_000,
        sortOrder: 'asc',
      });
      records = result.items;
    } else {
      const result = this.store.listRecords({
        page: 1,
        pageSize: 100_000,
        sortOrder: 'asc',
      });
      records = result.items;
    }

    log.info(
      `CertificateGenerator: generating certificate for session ${sessionId} with ${records.length} evidence records`,
    );

    // Compute trust metrics
    const verifiedCount = records.filter((r) => r.verified).length;
    const trustScore =
      records.length > 0 ? Math.round((verifiedCount / records.length) * 100 * 100) / 100 : 0;
    const trustLevel = computeTrustLevel(trustScore);

    // Build signature chain
    const evidenceHashes = records.map((r) => r.hash);
    const signatureChain = computeSignatureChain(records, sessionId);

    // Check chain integrity
    const chainIntegrity = getChainIntegrity(records, sessionId);

    // Build certificate object
    const certId = uuidv4();
    const generatedAt = new Date().toISOString();

    // Ensure output directory exists
    await mkdir(this.certsDir, { recursive: true });

    const pdfFileName = `qshield-cert-${certId}.pdf`;
    const pdfPath = path.join(this.certsDir, pdfFileName);

    // Compute verification hash
    const verificationHash = hmacSha256(
      [certId, sessionId, generatedAt, String(trustScore), signatureChain].join('|'),
      sessionId,
    );

    // Generate the PDF
    await this.renderPdf({
      certId,
      sessionId,
      generatedAt,
      trustScore,
      trustLevel,
      records,
      evidenceHashes,
      signatureChain,
      chainIntegrity,
      verificationHash,
      pdfPath,
    });

    const certificate: TrustCertificate = {
      id: certId,
      sessionId,
      generatedAt,
      trustScore,
      trustLevel,
      evidenceCount: records.length,
      evidenceHashes,
      signatureChain,
      pdfPath,
    };

    // Persist to the evidence store
    this.store.addCertificate(certificate);

    log.info(`CertificateGenerator: certificate ${certId} saved to ${pdfPath}`);
    return certificate;
  }

  /**
   * List all previously generated certificates.
   *
   * @returns Array of trust certificates, most recent first
   */
  list(): TrustCertificate[] {
    return this.store.listCertificates();
  }

  // -----------------------------------------------------------------------
  // PDF rendering
  // -----------------------------------------------------------------------

  /**
   * Render the professional PDF certificate.
   *
   * Layout sections:
   * 1. Branding header with logo placeholder
   * 2. Trust score gauge and summary
   * 3. Evidence summary table
   * 4. Hash chain integrity statement
   * 5. Generation metadata
   * 6. Verification section with QR placeholder
   */
  private renderPdf(params: {
    certId: string;
    sessionId: string;
    generatedAt: string;
    trustScore: number;
    trustLevel: TrustLevel;
    records: EvidenceRecord[];
    evidenceHashes: string[];
    signatureChain: string;
    chainIntegrity: { valid: boolean; length: number; brokenAt?: number; details: string[] };
    verificationHash: string;
    pdfPath: string;
  }): Promise<void> {
    const {
      certId,
      sessionId,
      generatedAt,
      trustScore,
      trustLevel,
      records,
      signatureChain,
      chainIntegrity,
      verificationHash,
      pdfPath,
    } = params;

    return new Promise<void>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
          info: {
            Title: 'QShield Trust Certificate',
            Author: 'QShield Desktop',
            Subject: `Trust Certificate for session ${sessionId}`,
            Creator: `QShield CertificateGenerator v${GENERATOR_VERSION}`,
          },
        });

        const stream = createWriteStream(pdfPath);
        doc.pipe(stream);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const levelColor = LEVEL_COLORS[trustLevel];
        const levelLabel = LEVEL_LABELS[trustLevel];
        const ml = doc.page.margins.left;

        // ================================================================
        // 1. BRANDING HEADER
        // ================================================================

        // Logo placeholder (shield shape)
        const logoSize = 40;
        const logoX = ml;
        const logoY = doc.y;

        // Draw a simple shield shape as logo placeholder
        doc.save();
        doc
          .moveTo(logoX + logoSize / 2, logoY)
          .lineTo(logoX + logoSize, logoY + logoSize * 0.3)
          .lineTo(logoX + logoSize, logoY + logoSize * 0.6)
          .lineTo(logoX + logoSize / 2, logoY + logoSize)
          .lineTo(logoX, logoY + logoSize * 0.6)
          .lineTo(logoX, logoY + logoSize * 0.3)
          .closePath()
          .fill(levelColor);
        doc.restore();

        // "QShield" text next to logo
        doc
          .fontSize(26)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text('QShield', logoX + logoSize + 12, logoY + 4, { continued: false });

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#64748b')
          .text('Trust Certificate', logoX + logoSize + 12, logoY + 28);

        doc.y = logoY + logoSize + 16;

        // Decorative line
        const lineY = doc.y;
        doc
          .strokeColor(levelColor)
          .lineWidth(3)
          .moveTo(ml, lineY)
          .lineTo(ml + pageWidth, lineY)
          .stroke();

        doc.moveDown(1);

        // ================================================================
        // 2. TRUST SCORE SECTION
        // ================================================================

        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text('Trust Score Summary');
        doc.moveDown(0.5);

        // Score gauge area
        const gaugeY = doc.y;
        const gaugeWidth = 200;
        const gaugeHeight = 16;
        const gaugeFill = (trustScore / 100) * gaugeWidth;

        // Gauge background
        doc
          .roundedRect(ml, gaugeY, gaugeWidth, gaugeHeight, 8)
          .fill('#e2e8f0');

        // Gauge fill
        if (gaugeFill > 0) {
          doc
            .roundedRect(ml, gaugeY, Math.max(gaugeFill, 16), gaugeHeight, 8)
            .fill(levelColor);
        }

        // Score text next to gauge
        doc
          .fontSize(28)
          .font('Helvetica-Bold')
          .fillColor(levelColor)
          .text(String(trustScore), ml + gaugeWidth + 20, gaugeY - 6, { continued: false });

        // Level badge
        const badgeX = ml + gaugeWidth + 90;
        const badgeWidth = 100;
        doc
          .roundedRect(badgeX, gaugeY - 2, badgeWidth, 24, 12)
          .fill(levelColor);

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#ffffff')
          .text(levelLabel, badgeX, gaugeY + 3, { width: badgeWidth, align: 'center' });

        doc.y = gaugeY + gaugeHeight + 16;

        // Session info
        doc.fontSize(9).font('Helvetica').fillColor('#64748b');
        doc.text(`Session ID: ${sessionId}`);
        doc.text(`Evidence Records: ${records.length}`);
        doc.text(`Verified Records: ${records.filter((r) => r.verified).length}`);
        doc.moveDown(1);

        // ================================================================
        // 3. EVIDENCE SUMMARY TABLE
        // ================================================================

        if (records.length > 0) {
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('Evidence Records');
          doc.moveDown(0.5);

          // Table header
          const colWidths = {
            hash: pageWidth * 0.25,
            source: pageWidth * 0.15,
            eventType: pageWidth * 0.25,
            timestamp: pageWidth * 0.35,
          };

          const tableX = ml;
          let tableY = doc.y;

          // Header row background
          doc.rect(tableX, tableY, pageWidth, 22).fill('#f1f5f9');

          doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a');

          let xPos = tableX + 4;
          doc.text('Hash', xPos, tableY + 6, { width: colWidths.hash - 8 });
          xPos += colWidths.hash;
          doc.text('Source', xPos, tableY + 6, { width: colWidths.source - 8 });
          xPos += colWidths.source;
          doc.text('Event Type', xPos, tableY + 6, { width: colWidths.eventType - 8 });
          xPos += colWidths.eventType;
          doc.text('Timestamp', xPos, tableY + 6, { width: colWidths.timestamp - 8 });

          tableY += 22;

          // Data rows (limit to top 30 records)
          const maxRows = 30;
          const displayRecords = records.slice(0, maxRows);

          for (let i = 0; i < displayRecords.length; i++) {
            const record = displayRecords[i];

            // Check if we need a new page
            if (tableY + 18 > doc.page.height - doc.page.margins.bottom - 100) {
              doc.addPage();
              tableY = doc.page.margins.top;
            }

            // Alternating row background
            if (i % 2 === 0) {
              doc.rect(tableX, tableY, pageWidth, 18).fill('#f8fafc');
            }

            doc.fontSize(7).font('Helvetica').fillColor('#334155');

            xPos = tableX + 4;
            // Truncated hash
            const truncHash = record.hash.slice(0, 8) + '...' + record.hash.slice(-8);
            doc.text(truncHash, xPos, tableY + 5, {
              width: colWidths.hash - 8,
              lineBreak: false,
            });
            xPos += colWidths.hash;
            doc.text(record.source, xPos, tableY + 5, {
              width: colWidths.source - 8,
              lineBreak: false,
            });
            xPos += colWidths.source;
            doc.text(record.eventType, xPos, tableY + 5, {
              width: colWidths.eventType - 8,
              lineBreak: false,
            });
            xPos += colWidths.eventType;
            const ts = new Date(record.timestamp).toLocaleString();
            doc.text(ts, xPos, tableY + 5, {
              width: colWidths.timestamp - 8,
              lineBreak: false,
            });

            tableY += 18;
          }

          if (records.length > maxRows) {
            doc.y = tableY + 4;
            doc
              .fontSize(8)
              .font('Helvetica-Oblique')
              .fillColor('#94a3b8')
              .text(`... and ${records.length - maxRows} more records`, { align: 'center' });
          }

          doc.y = tableY + 20;
        }

        // ================================================================
        // 4. HASH CHAIN INTEGRITY STATEMENT
        // ================================================================

        // Check if we need a new page
        if (doc.y + 120 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
        }

        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('Hash Chain Integrity');
        doc.moveDown(0.3);

        const integrityColor = chainIntegrity.valid ? '#16a34a' : '#dc2626';
        const integrityBg = chainIntegrity.valid ? '#f0fdf4' : '#fef2f2';
        const integrityText = chainIntegrity.valid
          ? 'CHAIN VERIFIED — All records are intact and properly linked.'
          : `CHAIN BROKEN at record index ${chainIntegrity.brokenAt ?? 'unknown'}.`;

        // Integrity status box
        const intBoxY = doc.y;
        doc
          .roundedRect(ml, intBoxY, pageWidth, 36, 6)
          .fill(integrityBg);

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(integrityColor)
          .text(integrityText, ml + 12, intBoxY + 6, { width: pageWidth - 24 });

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#64748b')
          .text(`Chain length: ${chainIntegrity.length} records`, ml + 12, intBoxY + 22);

        doc.y = intBoxY + 44;

        // ================================================================
        // 5. SIGNATURE CHAIN
        // ================================================================

        doc.moveDown(0.5);

        // Divider
        doc
          .strokeColor('#e2e8f0')
          .lineWidth(1)
          .moveTo(ml, doc.y)
          .lineTo(ml + pageWidth, doc.y)
          .stroke();

        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Signature Chain Hash');
        doc.moveDown(0.2);

        doc
          .fontSize(7)
          .font('Courier')
          .fillColor('#475569')
          .text(signatureChain, { width: pageWidth });

        doc.moveDown(1);

        // ================================================================
        // 6. VERIFICATION SECTION
        // ================================================================

        if (doc.y + 140 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
        }

        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('Verification');
        doc.moveDown(0.5);

        const verSectionY = doc.y;

        // QR Code placeholder (square with border)
        const qrSize = 80;
        const qrX = ml;
        const qrY = verSectionY;

        doc
          .rect(qrX, qrY, qrSize, qrSize)
          .strokeColor('#cbd5e1')
          .lineWidth(2)
          .stroke();

        // QR placeholder content
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#94a3b8')
          .text('QR Code', qrX, qrY + qrSize / 2 - 8, { width: qrSize, align: 'center' });
        doc
          .text('Placeholder', qrX, qrY + qrSize / 2 + 2, { width: qrSize, align: 'center' });

        // Verification details next to QR
        const verDetailsX = qrX + qrSize + 16;
        const verDetailsWidth = pageWidth - qrSize - 16;

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text('Verification Hash', verDetailsX, qrY);

        doc
          .fontSize(7)
          .font('Courier')
          .fillColor('#475569')
          .text(verificationHash, verDetailsX, qrY + 14, { width: verDetailsWidth });

        doc.moveDown(0.3);

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#64748b')
          .text(`Certificate ID: ${certId}`, verDetailsX, qrY + 34);
        doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, verDetailsX, qrY + 46);
        doc.text(`Generator: QShield CertificateGenerator v${GENERATOR_VERSION}`, verDetailsX, qrY + 58);
        doc.text(`Session: ${sessionId}`, verDetailsX, qrY + 70);

        doc.y = verSectionY + qrSize + 20;

        // ================================================================
        // FOOTER
        // ================================================================

        // Ensure footer is at the bottom
        if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
        }

        // Footer divider
        doc
          .strokeColor('#e2e8f0')
          .lineWidth(0.5)
          .moveTo(ml, doc.y)
          .lineTo(ml + pageWidth, doc.y)
          .stroke();

        doc.moveDown(0.3);

        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#94a3b8')
          .text(
            'This certificate was generated by QShield Desktop. Verify the signature chain hash and verification hash to confirm evidence integrity.',
            { align: 'center' },
          );

        // Finalize
        doc.end();

        stream.on('finish', () => {
          resolve();
        });

        stream.on('error', (err) => {
          log.error('CertificateGenerator: PDF stream error', err);
          reject(err);
        });
      } catch (err) {
        log.error('CertificateGenerator: failed to render PDF', err);
        reject(err);
      }
    });
  }
}
