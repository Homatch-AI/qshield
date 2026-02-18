import Database, { type Statement } from 'better-sqlite3';
import log from 'electron-log';
import { app } from 'electron';
import path from 'node:path';

// ---------------------------------------------------------------------------
// SQL schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trust_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  score REAL NOT NULL,
  level TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  anomaly_count INTEGER NOT NULL DEFAULT 0,
  channels_active INTEGER NOT NULL DEFAULT 0,
  assets_monitored INTEGER NOT NULL DEFAULT 0,
  assets_verified INTEGER NOT NULL DEFAULT 0,
  assets_changed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON trust_snapshots(timestamp);

CREATE TABLE IF NOT EXISTS trust_daily_summary (
  date TEXT PRIMARY KEY,
  avg_score REAL NOT NULL,
  min_score REAL NOT NULL,
  max_score REAL NOT NULL,
  snapshot_count INTEGER NOT NULL,
  total_events INTEGER NOT NULL DEFAULT 0,
  total_anomalies INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'C',
  streak INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_daily_date ON trust_daily_summary(date);

CREATE TABLE IF NOT EXISTS trust_milestones (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏆',
  earned_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_earned ON trust_milestones(earned_at);
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotStats {
  eventCount: number;
  anomalyCount: number;
  channelsActive: number;
  assetsMonitored: number;
  assetsVerified: number;
  assetsChanged: number;
}

export interface DailySummary {
  date: string;
  avgScore: number;
  minScore: number;
  maxScore: number;
  snapshotCount: number;
  totalEvents: number;
  totalAnomalies: number;
  grade: string;
  streak: number;
}

export interface ScoreHistoryEntry {
  timestamp: string;
  score: number;
  level: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  earnedAt: string;
}

export interface LifetimeStats {
  totalDays: number;
  avgScore: number;
  currentStreak: number;
  longestStreak: number;
  currentGrade: string;
  trend: 'improving' | 'stable' | 'declining';
  totalSnapshots: number;
  totalEvents: number;
  totalAnomalies: number;
  milestones: Milestone[];
  recentScores: ScoreHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Milestone definitions
// ---------------------------------------------------------------------------

interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const MILESTONE_DEFS: MilestoneDef[] = [
  { id: 'first-day', title: 'First Day', description: 'Completed your first day of trust monitoring', icon: '🌟' },
  { id: 'week-streak', title: 'Week Streak', description: 'Maintained high trust for 7 consecutive days', icon: '🔥' },
  { id: 'month-streak', title: 'Month Streak', description: 'Maintained high trust for 30 consecutive days', icon: '💎' },
  { id: 'a-grade', title: 'A Grade', description: 'Achieved an A grade daily summary', icon: '🏅' },
  { id: 'a-plus', title: 'A+ Grade', description: 'Achieved a perfect A+ grade daily summary', icon: '🏆' },
  { id: '100-events', title: '100 Events', description: 'Processed 100 trust events', icon: '📊' },
  { id: '1000-events', title: '1000 Events', description: 'Processed 1,000 trust events', icon: '📈' },
  { id: 'zero-anomalies-week', title: 'Clean Week', description: 'Zero anomalies for an entire week', icon: '✨' },
  { id: 'first-asset', title: 'First Asset', description: 'Registered your first high-trust asset', icon: '🔐' },
  { id: '5-assets', title: '5 Assets', description: 'Registered 5 high-trust assets', icon: '🛡️' },
];

// ---------------------------------------------------------------------------
// TrustHistoryService
// ---------------------------------------------------------------------------

export class TrustHistoryService {
  private db: Database.Database;

  // Prepared statements
  private stmtInsertSnapshot!: Statement;
  private stmtSnapshotsForDate!: Statement;
  private stmtUpsertDaily!: Statement;
  private stmtGetDaily!: Statement;
  private stmtGetDailyRange!: Statement;
  private stmtInsertMilestone!: Statement;
  private stmtGetMilestone!: Statement;
  private stmtListMilestones!: Statement;
  private stmtRecentScores!: Statement;
  private stmtTotalSnapshots!: Statement;
  private stmtTotalEvents!: Statement;
  private stmtOverallAvg!: Statement;
  private stmtTotalDays!: Statement;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(app.getPath('userData'), 'trust-history.db');
    log.info(`[TrustHistory] Opening database at ${resolvedPath}`);

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(SCHEMA);
    this.prepareStatements();

    log.info('[TrustHistory] Initialized successfully');
  }

  // -----------------------------------------------------------------------
  // Prepared statements
  // -----------------------------------------------------------------------

  private prepareStatements(): void {
    this.stmtInsertSnapshot = this.db.prepare(
      `INSERT INTO trust_snapshots
        (timestamp, score, level, event_count, anomaly_count, channels_active, assets_monitored, assets_verified, assets_changed)
       VALUES
        (@timestamp, @score, @level, @eventCount, @anomalyCount, @channelsActive, @assetsMonitored, @assetsVerified, @assetsChanged)`,
    );

    this.stmtSnapshotsForDate = this.db.prepare(
      `SELECT * FROM trust_snapshots
       WHERE timestamp >= ? AND timestamp < ?
       ORDER BY timestamp ASC`,
    );

    this.stmtUpsertDaily = this.db.prepare(
      `INSERT INTO trust_daily_summary
        (date, avg_score, min_score, max_score, snapshot_count, total_events, total_anomalies, grade, streak)
       VALUES
        (@date, @avgScore, @minScore, @maxScore, @snapshotCount, @totalEvents, @totalAnomalies, @grade, @streak)
       ON CONFLICT(date) DO UPDATE SET
        avg_score = excluded.avg_score,
        min_score = excluded.min_score,
        max_score = excluded.max_score,
        snapshot_count = excluded.snapshot_count,
        total_events = excluded.total_events,
        total_anomalies = excluded.total_anomalies,
        grade = excluded.grade,
        streak = excluded.streak`,
    );

    this.stmtGetDaily = this.db.prepare(
      'SELECT * FROM trust_daily_summary WHERE date = ?',
    );

    this.stmtGetDailyRange = this.db.prepare(
      'SELECT * FROM trust_daily_summary WHERE date >= ? AND date <= ? ORDER BY date ASC',
    );

    this.stmtInsertMilestone = this.db.prepare(
      `INSERT OR IGNORE INTO trust_milestones (id, title, description, icon, earned_at)
       VALUES (@id, @title, @description, @icon, @earnedAt)`,
    );

    this.stmtGetMilestone = this.db.prepare(
      'SELECT * FROM trust_milestones WHERE id = ?',
    );

    this.stmtListMilestones = this.db.prepare(
      'SELECT * FROM trust_milestones ORDER BY earned_at DESC',
    );

    this.stmtRecentScores = this.db.prepare(
      'SELECT timestamp, score, level FROM trust_snapshots ORDER BY timestamp DESC LIMIT ?',
    );

    this.stmtTotalSnapshots = this.db.prepare(
      'SELECT COUNT(*) AS cnt FROM trust_snapshots',
    );

    this.stmtTotalEvents = this.db.prepare(
      'SELECT COALESCE(SUM(event_count), 0) AS total FROM trust_snapshots',
    );

    this.stmtOverallAvg = this.db.prepare(
      'SELECT COALESCE(AVG(avg_score), 0) AS avg FROM trust_daily_summary',
    );

    this.stmtTotalDays = this.db.prepare(
      'SELECT COUNT(*) AS cnt FROM trust_daily_summary',
    );
  }

  // -----------------------------------------------------------------------
  // Snapshots
  // -----------------------------------------------------------------------

  recordSnapshot(score: number, level: string, stats: SnapshotStats): void {
    this.stmtInsertSnapshot.run({
      timestamp: new Date().toISOString(),
      score,
      level,
      eventCount: stats.eventCount,
      anomalyCount: stats.anomalyCount,
      channelsActive: stats.channelsActive,
      assetsMonitored: stats.assetsMonitored,
      assetsVerified: stats.assetsVerified,
      assetsChanged: stats.assetsChanged,
    });
    log.debug(`[TrustHistory] Snapshot recorded: score=${score}, level=${level}`);
  }

  // -----------------------------------------------------------------------
  // Daily summaries
  // -----------------------------------------------------------------------

  computeDailySummary(date: string): DailySummary | null {
    // date is YYYY-MM-DD
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const snapshots = this.stmtSnapshotsForDate.all(startOfDay, endOfDay) as Array<{
      score: number;
      event_count: number;
      anomaly_count: number;
    }>;

    if (snapshots.length === 0) return null;

    const scores = snapshots.map((s) => s.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const totalEvents = snapshots.reduce((a, s) => a + s.event_count, 0);
    const totalAnomalies = snapshots.reduce((a, s) => a + s.anomaly_count, 0);
    const streak = this.getCurrentStreak();
    const grade = this.computeGrade(avgScore, totalAnomalies, streak);

    const summary: DailySummary = {
      date,
      avgScore: Math.round(avgScore * 100) / 100,
      minScore,
      maxScore,
      snapshotCount: snapshots.length,
      totalEvents,
      totalAnomalies,
      grade,
      streak,
    };

    this.stmtUpsertDaily.run({
      date: summary.date,
      avgScore: summary.avgScore,
      minScore: summary.minScore,
      maxScore: summary.maxScore,
      snapshotCount: summary.snapshotCount,
      totalEvents: summary.totalEvents,
      totalAnomalies: summary.totalAnomalies,
      grade: summary.grade,
      streak: summary.streak,
    });

    log.info(`[TrustHistory] Daily summary computed for ${date}: grade=${grade}, avg=${summary.avgScore}`);
    return summary;
  }

  getDailySummary(date: string): DailySummary | null {
    const row = this.stmtGetDaily.get(date) as Record<string, unknown> | undefined;
    return row ? this.rowToDailySummary(row) : null;
  }

  getDailySummaries(from: string, to: string): DailySummary[] {
    const rows = this.stmtGetDailyRange.all(from, to) as Record<string, unknown>[];
    return rows.map((r) => this.rowToDailySummary(r));
  }

  // -----------------------------------------------------------------------
  // Grading
  // -----------------------------------------------------------------------

  computeGrade(avg: number, anomalies: number, streak: number): string {
    if (avg >= 95 && anomalies === 0 && streak >= 30) return 'A+';
    if (avg >= 90) return 'A';
    if (avg >= 85) return 'A-';
    if (avg >= 80) return 'B+';
    if (avg >= 70) return 'B';
    if (avg >= 65) return 'B-';
    if (avg >= 55) return 'C+';
    if (avg >= 40) return 'C';
    if (avg >= 25) return 'D';
    return 'F';
  }

  // -----------------------------------------------------------------------
  // Streaks
  // -----------------------------------------------------------------------

  getCurrentStreak(): number {
    const rows = this.db.prepare(
      'SELECT date, avg_score FROM trust_daily_summary ORDER BY date DESC',
    ).all() as Array<{ date: string; avg_score: number }>;

    let streak = 0;
    for (const row of rows) {
      if (row.avg_score >= 80) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  getLongestStreak(): number {
    const rows = this.db.prepare(
      'SELECT avg_score FROM trust_daily_summary ORDER BY date ASC',
    ).all() as Array<{ avg_score: number }>;

    let longest = 0;
    let current = 0;
    for (const row of rows) {
      if (row.avg_score >= 80) {
        current++;
        if (current > longest) longest = current;
      } else {
        current = 0;
      }
    }
    return longest;
  }

  // -----------------------------------------------------------------------
  // Trend
  // -----------------------------------------------------------------------

  getTrend(days: number): 'improving' | 'stable' | 'declining' {
    const rows = this.db.prepare(
      'SELECT avg_score FROM trust_daily_summary ORDER BY date DESC LIMIT ?',
    ).all(days) as Array<{ avg_score: number }>;

    if (rows.length < 2) return 'stable';

    // rows are newest-first, reverse to get chronological order
    rows.reverse();

    const half = Math.floor(rows.length / 2);
    const firstHalf = rows.slice(0, half);
    const secondHalf = rows.slice(half);

    const avgFirst = firstHalf.reduce((a, r) => a + r.avg_score, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, r) => a + r.avg_score, 0) / secondHalf.length;

    const diff = avgSecond - avgFirst;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  // -----------------------------------------------------------------------
  // Score history
  // -----------------------------------------------------------------------

  getScoreHistory(days: number): ScoreHistoryEntry[] {
    // Return snapshots from the last N days
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db.prepare(
      'SELECT timestamp, score, level FROM trust_snapshots WHERE timestamp >= ? ORDER BY timestamp ASC',
    ).all(since) as Array<{ timestamp: string; score: number; level: string }>;

    return rows.map((r) => ({
      timestamp: r.timestamp,
      score: r.score,
      level: r.level,
    }));
  }

  // -----------------------------------------------------------------------
  // Milestones
  // -----------------------------------------------------------------------

  checkMilestones(score: number, streak: number, totalEvents?: number, assetsMonitored?: number): void {
    const now = new Date().toISOString();

    // first-day: has at least 1 daily summary
    const totalDays = (this.stmtTotalDays.get() as { cnt: number }).cnt;
    if (totalDays >= 1) {
      this.awardMilestone('first-day', now);
    }

    // week-streak
    if (streak >= 7) {
      this.awardMilestone('week-streak', now);
    }

    // month-streak
    if (streak >= 30) {
      this.awardMilestone('month-streak', now);
    }

    // a-grade: check latest daily summary
    const latestDaily = this.db.prepare(
      'SELECT grade FROM trust_daily_summary ORDER BY date DESC LIMIT 1',
    ).get() as { grade: string } | undefined;

    if (latestDaily) {
      if (['A+', 'A', 'A-'].includes(latestDaily.grade)) {
        this.awardMilestone('a-grade', now);
      }
      if (latestDaily.grade === 'A+') {
        this.awardMilestone('a-plus', now);
      }
    }

    // event milestones
    const evTotal = totalEvents ?? (this.stmtTotalEvents.get() as { total: number }).total;
    if (evTotal >= 100) this.awardMilestone('100-events', now);
    if (evTotal >= 1000) this.awardMilestone('1000-events', now);

    // zero-anomalies-week: last 7 daily summaries all have 0 anomalies
    const last7 = this.db.prepare(
      'SELECT total_anomalies FROM trust_daily_summary ORDER BY date DESC LIMIT 7',
    ).all() as Array<{ total_anomalies: number }>;
    if (last7.length >= 7 && last7.every((r) => r.total_anomalies === 0)) {
      this.awardMilestone('zero-anomalies-week', now);
    }

    // asset milestones
    const assets = assetsMonitored ?? 0;
    if (assets >= 1) this.awardMilestone('first-asset', now);
    if (assets >= 5) this.awardMilestone('5-assets', now);
  }

  private awardMilestone(id: string, earnedAt: string): void {
    const existing = this.stmtGetMilestone.get(id);
    if (existing) return;

    const def = MILESTONE_DEFS.find((m) => m.id === id);
    if (!def) return;

    this.stmtInsertMilestone.run({
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      earnedAt,
    });
    log.info(`[TrustHistory] Milestone earned: ${def.title}`);
  }

  getMilestones(): Milestone[] {
    const rows = this.stmtListMilestones.all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      description: r.description as string,
      icon: r.icon as string,
      earnedAt: r.earned_at as string,
    }));
  }

  // -----------------------------------------------------------------------
  // Lifetime stats
  // -----------------------------------------------------------------------

  getLifetimeStats(): LifetimeStats {
    const totalDays = (this.stmtTotalDays.get() as { cnt: number }).cnt;
    const avgScore = (this.stmtOverallAvg.get() as { avg: number }).avg;
    const totalSnapshots = (this.stmtTotalSnapshots.get() as { cnt: number }).cnt;
    const totalEvents = (this.stmtTotalEvents.get() as { total: number }).total;
    const totalAnomalies = (this.db.prepare(
      'SELECT COALESCE(SUM(total_anomalies), 0) AS total FROM trust_daily_summary',
    ).get() as { total: number }).total;

    const currentStreak = this.getCurrentStreak();
    const longestStreak = this.getLongestStreak();
    const trend = this.getTrend(14);
    const milestones = this.getMilestones();

    // Latest daily grade
    const latestDaily = this.db.prepare(
      'SELECT grade FROM trust_daily_summary ORDER BY date DESC LIMIT 1',
    ).get() as { grade: string } | undefined;

    // Recent scores (last 100 snapshots, newest first → reverse to chronological)
    const recentRows = this.stmtRecentScores.all(100) as Array<{ timestamp: string; score: number; level: string }>;
    const recentScores = recentRows.reverse().map((r) => ({
      timestamp: r.timestamp,
      score: r.score,
      level: r.level,
    }));

    return {
      totalDays,
      avgScore: Math.round(avgScore * 100) / 100,
      currentStreak,
      longestStreak,
      currentGrade: latestDaily?.grade ?? 'N/A',
      trend,
      totalSnapshots,
      totalEvents,
      totalAnomalies,
      milestones,
      recentScores,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private rowToDailySummary(row: Record<string, unknown>): DailySummary {
    return {
      date: row.date as string,
      avgScore: row.avg_score as number,
      minScore: row.min_score as number,
      maxScore: row.max_score as number,
      snapshotCount: row.snapshot_count as number,
      totalEvents: row.total_events as number,
      totalAnomalies: row.total_anomalies as number,
      grade: row.grade as string,
      streak: row.streak as number,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  close(): void {
    log.info('[TrustHistory] Closing database');
    this.db.close();
  }
}
