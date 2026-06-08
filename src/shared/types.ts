export interface Account {
  puuid: string
  gameName: string
  tagLine: string
  platform: string
  region: string
}

export interface MatchSummary {
  matchId: string
  puuid: string
  queue: number
  champion: string
  win: boolean
  gameCreation: number
  gameDuration: number
}

export interface MatchDetail {
  matchId: string
  rawJson: string
}

export interface Timeline {
  matchId: string
  rawJson: string
}

export interface CoachReport {
  id: number
  matchId: string
  createdAt: number
  model: string
  content: string
}

export interface FocusTask {
  id: string
  matchId: string
  description: string
  metric: string
  comparator: '>=' | '<=' | '==' | '>'| '<'
  target: number
  scope: 'champion' | 'role' | 'universal'
  champion?: string
  role?: string
}

export type TaskEvaluationResult = 'improved' | 'held' | 'regressed' | 'not_applicable'

export interface TaskEvaluation {
  taskId: string
  evaluatingMatchId: string
  result: TaskEvaluationResult
  actualValue: number | null
}

export interface IpcApi {
  syncMatches: (count: number) => Promise<void>
  getMatchList: () => Promise<MatchSummary[]>
  analyzeMatch: (matchId: string) => Promise<void>
  getCoachReport: (matchId: string) => Promise<CoachReport | null>
}
