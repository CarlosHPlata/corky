import type { CoachReport, FocusTask, TaskEvaluation, MatchAnalysis, StandingFocusTask } from '@shared/types'

export interface ReportRepository {
  insertReport(report: Omit<CoachReport, 'id'>): number
  getReport(matchId: string): CoachReport | null
  insertFocusTasks(tasks: FocusTask[]): void
  getFocusTasks(matchId: string): FocusTask[]
  insertTaskEvaluation(evaluation: TaskEvaluation): void
  getTaskEvaluations(evaluatingMatchId: string): TaskEvaluation[]
  /** Persist the AI match analysis (spec 004). A partial run never overwrites a
   * stored full ('done') read (FR-028). */
  upsertMatchAnalysis(analysis: MatchAnalysis): void
  /** Restore the stored analysis for a match, or null if never run (FR-027). */
  getMatchAnalysis(matchId: string): MatchAnalysis | null
  /** The player's active standing focus tasks (US4). */
  getStandingTasks(puuid: string): StandingFocusTask[]
  /** Upsert the active standing set for the player. */
  saveStandingTasks(puuid: string, tasks: StandingFocusTask[], at: number): void
  /** Mark the given task ids retired (dropped from the active set). */
  retireStandingTasks(ids: string[], at: number): void
}
