import type Database from 'better-sqlite3'
import type { CoachReport, FocusTask, TaskEvaluation } from '@shared/types'
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
}
