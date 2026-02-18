/**
 * SQLite-backed storage for Trust Reports.
 * Pattern follows evidence-store.ts / asset-store.ts.
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import log from 'electron-log';
import type { TrustReport, TrustReportType, TrustLevel } from '@qshield/core';

const DB_NAME = 'trust-reports.db';

export class TrustReportStore {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(app.getPath('userData'), DB_NAME);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    log.info(`[TrustReportStore] Initialized at ${dbPath}`);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trust_reports (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        trust_score REAL NOT NULL,
        trust_grade TEXT NOT NULL,
        trust_level TEXT NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        channels_monitored INTEGER NOT NULL,
        assets_monitored INTEGER NOT NULL,
        total_events INTEGER NOT NULL,
        anomalies_detected INTEGER NOT NULL,
        anomalies_resolved INTEGER NOT NULL,
        email_score REAL,
        file_score REAL,
        meeting_score REAL,
        asset_score REAL,
        evidence_count INTEGER NOT NULL,
        chain_integrity INTEGER NOT NULL DEFAULT 1,
        signature_chain TEXT NOT NULL,
        notes TEXT,
        asset_id TEXT,
        asset_name TEXT,
        pdf_path TEXT
      );
    `);
  }

  insert(report: TrustReport): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trust_reports (
        id, type, title, generated_at, trust_score, trust_grade, trust_level,
        from_date, to_date, channels_monitored, assets_monitored,
        total_events, anomalies_detected, anomalies_resolved,
        email_score, file_score, meeting_score, asset_score,
        evidence_count, chain_integrity, signature_chain,
        notes, asset_id, asset_name, pdf_path
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `);
    stmt.run(
      report.id, report.type, report.title, report.generatedAt,
      report.trustScore, report.trustGrade, report.trustLevel,
      report.fromDate, report.toDate, report.channelsMonitored, report.assetsMonitored,
      report.totalEvents, report.anomaliesDetected, report.anomaliesResolved,
      report.emailScore, report.fileScore, report.meetingScore, report.assetScore,
      report.evidenceCount, report.chainIntegrity ? 1 : 0, report.signatureChain,
      report.notes ?? null, report.assetId ?? null, report.assetName ?? null, report.pdfPath ?? null,
    );
  }

  get(id: string): TrustReport | null {
    const row = this.db.prepare('SELECT * FROM trust_reports WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToReport(row);
  }

  list(): TrustReport[] {
    const rows = this.db.prepare('SELECT * FROM trust_reports ORDER BY generated_at DESC').all() as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToReport(r));
  }

  updatePdfPath(id: string, pdfPath: string): void {
    this.db.prepare('UPDATE trust_reports SET pdf_path = ? WHERE id = ?').run(pdfPath, id);
  }

  private rowToReport(row: Record<string, unknown>): TrustReport {
    return {
      id: row.id as string,
      type: row.type as TrustReportType,
      title: row.title as string,
      generatedAt: row.generated_at as string,
      trustScore: row.trust_score as number,
      trustGrade: row.trust_grade as string,
      trustLevel: row.trust_level as TrustLevel,
      fromDate: row.from_date as string,
      toDate: row.to_date as string,
      channelsMonitored: row.channels_monitored as number,
      assetsMonitored: row.assets_monitored as number,
      totalEvents: row.total_events as number,
      anomaliesDetected: row.anomalies_detected as number,
      anomaliesResolved: row.anomalies_resolved as number,
      emailScore: row.email_score as number,
      fileScore: row.file_score as number,
      meetingScore: row.meeting_score as number,
      assetScore: row.asset_score as number,
      evidenceCount: row.evidence_count as number,
      chainIntegrity: row.chain_integrity === 1,
      signatureChain: row.signature_chain as string,
      notes: row.notes as string | undefined,
      assetId: row.asset_id as string | undefined,
      assetName: row.asset_name as string | undefined,
      pdfPath: row.pdf_path as string | undefined,
    };
  }

  close(): void {
    this.db.close();
    log.info('[TrustReportStore] Database closed');
  }
}
