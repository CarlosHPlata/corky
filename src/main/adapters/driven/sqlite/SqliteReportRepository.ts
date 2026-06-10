import type Database from 'better-sqlite3'
import type { CoachReport, FocusTask, TaskEvaluation, MatchAnalysis, StandingFocusTask } from '@shared/types'
import type { ReportRepository } from '../../../application/ports/ReportRepository'

export class SqliteReportRepository implements ReportRepository {
  constructor(private readonly db: Database.Database) {}

  insertReport(report: Omit<CoachReport, 'id'>): number {
    const result = this.db
      .prepare(
        `INSERT INTO coach_reports (match_id, created_at, model, content)
         VALUES (?, ?, ?, ?)`
      )
      .run(report.matchId, report.createdAt, report.model, report.content)
    return result.lastInsertRowid as number
  }

  getReport(matchId: string): CoachReport | null {
    const row = this.db
      .prepare('SELECT * FROM coach_reports WHERE match_id = ? ORDER BY id DESC LIMIT 1')
      .get(matchId) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: row.id as number,
      matchId: row.match_id as string,
      createdAt: row.created_at as number,
      model: row.model as string,
      content: row.content as string
    }
  }

  insertFocusTasks(tasks: FocusTask[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO focus_tasks
       (id, match_id, description, metric, comparator, target, scope, champion, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertAll = this.db.transaction((ts: FocusTask[]) => {
      for (const t of ts) {
        stmt.run(t.id, t.matchId, t.description, t.metric, t.comparator, t.target, t.scope, t.champion ?? null, t.role ?? null)
      }
    })
    insertAll(tasks)
  }

  getFocusTasks(matchId: string): FocusTask[] {
    const rows = this.db
      .prepare('SELECT * FROM focus_tasks WHERE match_id = ?')
      .all(matchId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      matchId: r.match_id as string,
      description: r.description as string,
      metric: r.metric as string,
      comparator: r.comparator as FocusTask['comparator'],
      target: r.target as number,
      scope: r.scope as FocusTask['scope'],
      champion: r.champion as string | undefined,
      role: r.role as string | undefined
    }))
  }

  insertTaskEvaluation(evaluation: TaskEvaluation): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO task_evaluations
         (task_id, evaluating_match_id, result, actual_value)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        evaluation.taskId,
        evaluation.evaluatingMatchId,
        evaluation.result,
        evaluation.actualValue ?? null
      )
  }

  getTaskEvaluations(evaluatingMatchId: string): TaskEvaluation[] {
    const rows = this.db
      .prepare('SELECT * FROM task_evaluations WHERE evaluating_match_id = ?')
      .all(evaluatingMatchId) as Record<string, unknown>[]
    return rows.map((r) => ({
      taskId: r.task_id as string,
      evaluatingMatchId: r.evaluating_match_id as string,
      result: r.result as TaskEvaluation['result'],
      actualValue: r.actual_value as number | null
    }))
  }

  listTaskEvaluations(taskIds: string[]): TaskEvaluation[] {
    if (!taskIds.length) return []
    // Evaluations carry no timestamp of their own — order by the evaluating
    // game's creation time (a missing match sorts last under DESC).
    const rows = this.db
      .prepare(
        `SELECT te.* FROM task_evaluations te
         LEFT JOIN matches m ON m.match_id = te.evaluating_match_id
         WHERE te.task_id IN (${taskIds.map(() => '?').join(', ')})
         ORDER BY m.game_creation DESC`
      )
      .all(...taskIds) as Record<string, unknown>[]
    return rows.map((r) => ({
      taskId: r.task_id as string,
      evaluatingMatchId: r.evaluating_match_id as string,
      result: r.result as TaskEvaluation['result'],
      actualValue: r.actual_value as number | null
    }))
  }

  countMatchAnalyses(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM match_analyses').get() as { n: number }
    return row.n
  }

  upsertMatchAnalysis(analysis: MatchAnalysis): void {
    // Guard: a partial run must not clobber a previously stored full read (FR-028).
    const existing = this.db
      .prepare('SELECT status FROM match_analyses WHERE match_id = ?')
      .get(analysis.matchId) as { status?: string } | undefined
    if (existing?.status === 'done' && analysis.status === 'partial') return

    this.db
      .prepare(
        `INSERT OR REPLACE INTO match_analyses
         (match_id, created_at, light_model, heavy_model, status, json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        analysis.matchId,
        analysis.generatedAt,
        analysis.lightModel,
        analysis.heavyModel,
        analysis.status,
        JSON.stringify(analysis)
      )
  }

  getMatchAnalysis(matchId: string): MatchAnalysis | null {
    const row = this.db
      .prepare('SELECT json FROM match_analyses WHERE match_id = ?')
      .get(matchId) as { json?: string } | undefined
    if (!row?.json) return null
    try {
      return JSON.parse(row.json) as MatchAnalysis
    } catch {
      return null
    }
  }

  getStandingTasks(puuid: string): StandingFocusTask[] {
    const rows = this.db
      .prepare("SELECT * FROM standing_focus_tasks WHERE puuid = ? AND status = 'active' ORDER BY created_at")
      .all(puuid) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      description: r.description as string,
      metric: r.metric as StandingFocusTask['metric'],
      comparator: r.comparator as StandingFocusTask['comparator'],
      target: r.target as number,
      scope: r.scope as StandingFocusTask['scope'],
      champion: (r.champion as string | null) ?? undefined,
      role: (r.role as string | null) ?? undefined,
      status: r.status as StandingFocusTask['status'],
      sourceMatchId: r.source_match_id as string
    }))
  }

  saveStandingTasks(puuid: string, tasks: StandingFocusTask[], at: number): void {
    const stmt = this.db.prepare(
      `INSERT INTO standing_focus_tasks
         (id, puuid, description, metric, comparator, target, scope, champion, role, status, source_match_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         description = excluded.description, metric = excluded.metric,
         comparator = excluded.comparator, target = excluded.target, scope = excluded.scope,
         champion = excluded.champion, role = excluded.role, status = excluded.status,
         updated_at = excluded.updated_at`
    )
    const saveAll = this.db.transaction((ts: StandingFocusTask[]) => {
      for (const t of ts) {
        stmt.run(
          t.id, puuid, t.description, t.metric, t.comparator, t.target, t.scope,
          t.champion ?? null, t.role ?? null, t.status, t.sourceMatchId, at, at
        )
      }
    })
    saveAll(tasks)
  }

  retireStandingTasks(ids: string[], at: number): void {
    if (!ids.length) return
    const stmt = this.db.prepare(
      "UPDATE standing_focus_tasks SET status = 'retired', updated_at = ? WHERE id = ?"
    )
    const retireAll = this.db.transaction((xs: string[]) => {
      for (const id of xs) stmt.run(at, id)
    })
    retireAll(ids)
  }
}
