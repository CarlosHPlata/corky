import type { CoachReport, FocusTask, TaskEvaluation } from '@shared/types'

export interface ReportRepository {
  insertReport(report: Omit<CoachReport, 'id'>): number
  getReport(matchId: string): CoachReport | null
  insertFocusTasks(tasks: FocusTask[]): void
  getFocusTasks(matchId: string): FocusTask[]
  insertTaskEvaluation(evaluation: TaskEvaluation): void
  getTaskEvaluations(evaluatingMatchId: string): TaskEvaluation[]
}
