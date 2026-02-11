import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import {
  computeSignatureChain,
  computeTrustScore,
  computeTrustLevel,
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

/** Colour palette keyed by trust level for PDF rendering. */
const LEVEL_COLORS: Record<TrustLevel, string> = {
  verified: '#16a34a',  // green-600
  normal: '#2563eb',    // blue-600
  elevated: '#d97706',  // amber-600
  warning: '#ea580c',   // orange-600
  critical: '#dc2626',  // red-600
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

export class CertificateGenerator {
  private store: EvidenceStore;
  private certsDir: string;

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
   * @param opts.sessionId        The session to certify.
   * @param opts.evidenceIds      Specific evidence record IDs to include.
   * @param opts.includeAllEvidence  When true, include every record in the store.
   * @returns The persisted TrustCertificate with the path to the generated PDF.
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
      // Fetch all records via a large page
      const result = this.store.listRecords({
        page: 1,
        pageSize: 100_000,
        sortOrder: 'asc',
      });
      records = result.items;
    } else {
      // Default: include all records (same as includeAllEvidence)
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
    // We derive a simple trust score from the evidence: percentage of verified records
    const verifiedCount = records.filter((r) => r.verified).length;
    const trustScore =
      records.length > 0 ? Math.round((verifiedCount / records.length) * 100 * 100) / 100 : 0;
    const trustLevel = computeTrustLevel(trustScore);

    // Build signature chain
    const evidenceHashes = records.map((r) => r.hash);
    // computeSignatureChain expects EvidenceRecord[] and an hmacKey. We pass
    // the records directly; the function uses each record's .hash internally
    // and computes HMAC over them. For the key we use a deterministic session
    // key derived from the session ID.
    const signatureChain = computeSignatureChain(records, sessionId);

    // Build certificate object
    const certId = uuidv4();
    const generatedAt = new Date().toISOString();

    // Ensure output directory exists
    await mkdir(this.certsDir, { recursive: true });

    const pdfFileName = `qshield-cert-${certId}.pdf`;
    const pdfPath = path.join(this.certsDir, pdfFileName);

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
   */
  list(): TrustCertificate[] {
    return this.store.listCertificates();
  }

  // -----------------------------------------------------------------------
  // PDF rendering
  // -----------------------------------------------------------------------

  private renderPdf(params: {
    certId: string;
    sessionId: string;
    generatedAt: string;
    trustScore: number;
    trustLevel: TrustLevel;
    records: EvidenceRecord[];
    evidenceHashes: string[];
    signatureChain: string;
    pdfPath: string;
  }): Promise<void> {
    const {
      certId,
      sessionId,
      generatedAt,
      trustScore,
      trustLevel,
      records,
      evidenceHashes,
      signatureChain,
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
            Creator: 'QShield CertificateGenerator',
          },
        });

        const stream = createWriteStream(pdfPath);
        doc.pipe(stream);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const levelColor = LEVEL_COLORS[trustLevel];
        const levelLabel = LEVEL_LABELS[trustLevel];

        // -------------------------------------------------------------------
        // Header
        // -------------------------------------------------------------------

        doc
          .fontSize(28)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text('QShield Trust Certificate', { align: 'center' });

        doc.moveDown(0.3);

        // Decorative line
        const lineY = doc.y;
        doc
          .strokeColor(levelColor)
          .lineWidth(3)
          .moveTo(doc.page.margins.left, lineY)
          .lineTo(doc.page.margins.left + pageWidth, lineY)
          .stroke();

        doc.moveDown(1);

        // -------------------------------------------------------------------
        // Certificate metadata
        // -------------------------------------------------------------------

        doc.fontSize(10).font('Helvetica').fillColor('#64748b');
        doc.text(`Certificate ID: ${certId}`);
        doc.text(`Session ID: ${sessionId}`);
        doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`);
        doc.moveDown(1);

        // -------------------------------------------------------------------
        // Trust score badge
        // -------------------------------------------------------------------

        const badgeY = doc.y;
        const badgeHeight = 60;
        const badgeWidth = pageWidth;

        // Background rectangle
        doc
          .roundedRect(doc.page.margins.left, badgeY, badgeWidth, badgeHeight, 8)
          .fillAndStroke(levelColor, levelColor);

        // Score text
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .fillColor('#ffffff')
          .text(`Trust Score: ${trustScore}`, doc.page.margins.left, badgeY + 8, {
            width: badgeWidth,
            align: 'center',
          });

        doc
          .fontSize(14)
          .font('Helvetica')
          .fillColor('#ffffff')
          .text(`Level: ${levelLabel}`, doc.page.margins.left, badgeY + 36, {
            width: badgeWidth,
            align: 'center',
          });

        doc.y = badgeY + badgeHeight + 20;

        // -------------------------------------------------------------------
        // Evidence summary
        // -------------------------------------------------------------------

        doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f172a').text('Evidence Summary');
        doc.moveDown(0.3);

        doc.fontSize(10).font('Helvetica').fillColor('#334155');
        doc.text(`Total Evidence Records: ${records.length}`);
        doc.text(`Verified Records: ${records.filter((r) => r.verified).length}`);
        doc.text(
          `Hash Chain: ${evidenceHashes.length > 0 ? evidenceHashes[0].slice(0, 16) + '...' + evidenceHashes[evidenceHashes.length - 1].slice(-16) : 'N/A'}`,
        );
        doc.moveDown(1);

        // -------------------------------------------------------------------
        // Evidence records table
        // -------------------------------------------------------------------

        if (records.length > 0) {
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f172a').text('Evidence Records');
          doc.moveDown(0.5);

          // Table header
          const colWidths = {
            id: pageWidth * 0.25,
            source: pageWidth * 0.15,
            eventType: pageWidth * 0.25,
            timestamp: pageWidth * 0.25,
            verified: pageWidth * 0.10,
          };

          const tableX = doc.page.margins.left;
          let tableY = doc.y;

          // Header row background
          doc.rect(tableX, tableY, pageWidth, 20).fill('#f1f5f9');

          doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a');

          let xPos = tableX + 4;
          doc.text('ID', xPos, tableY + 5, { width: colWidths.id - 8 });
          xPos += colWidths.id;
          doc.text('Source', xPos, tableY + 5, { width: colWidths.source - 8 });
          xPos += colWidths.source;
          doc.text('Event Type', xPos, tableY + 5, { width: colWidths.eventType - 8 });
          xPos += colWidths.eventType;
          doc.text('Timestamp', xPos, tableY + 5, { width: colWidths.timestamp - 8 });
          xPos += colWidths.timestamp;
          doc.text('Valid', xPos, tableY + 5, { width: colWidths.verified - 8 });

          tableY += 20;

          // Data rows (limit to prevent extremely long PDFs)
          const maxRows = 50;
          const displayRecords = records.slice(0, maxRows);

          for (let i = 0; i < displayRecords.length; i++) {
            const record = displayRecords[i];

            // Check if we need a new page
            if (tableY + 18 > doc.page.height - doc.page.margins.bottom) {
              doc.addPage();
              tableY = doc.page.margins.top;
            }

            // Alternating row background
            if (i % 2 === 0) {
              doc.rect(tableX, tableY, pageWidth, 18).fill('#f8fafc');
            }

            doc.fontSize(7).font('Helvetica').fillColor('#334155');

            xPos = tableX + 4;
            doc.text(record.id.slice(0, 12) + '...', xPos, tableY + 4, {
              width: colWidths.id - 8,
              lineBreak: false,
            });
            xPos += colWidths.id;
            doc.text(record.source, xPos, tableY + 4, {
              width: colWidths.source - 8,
              lineBreak: false,
            });
            xPos += colWidths.source;
            doc.text(record.eventType, xPos, tableY + 4, {
              width: colWidths.eventType - 8,
              lineBreak: false,
            });
            xPos += colWidths.eventType;
            const ts = new Date(record.timestamp).toLocaleString();
            doc.text(ts, xPos, tableY + 4, {
              width: colWidths.timestamp - 8,
              lineBreak: false,
            });
            xPos += colWidths.timestamp;
            doc
              .fillColor(record.verified ? '#16a34a' : '#94a3b8')
              .text(record.verified ? 'Yes' : 'No', xPos, tableY + 4, {
                width: colWidths.verified - 8,
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

        // -------------------------------------------------------------------
        // Signature chain
        // -------------------------------------------------------------------

        // Check if we need a new page for the footer
        if (doc.y + 80 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
        }

        doc.moveDown(1);

        // Divider
        const dividerY = doc.y;
        doc
          .strokeColor('#e2e8f0')
          .lineWidth(1)
          .moveTo(doc.page.margins.left, dividerY)
          .lineTo(doc.page.margins.left + pageWidth, dividerY)
          .stroke();

        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Signature Chain Hash');
        doc.moveDown(0.2);

        doc
          .fontSize(8)
          .font('Courier')
          .fillColor('#475569')
          .text(signatureChain, { width: pageWidth });

        doc.moveDown(1);

        // Footer
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#94a3b8')
          .text(
            'This certificate was generated by QShield Desktop. Verify the signature chain hash to confirm evidence integrity.',
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
