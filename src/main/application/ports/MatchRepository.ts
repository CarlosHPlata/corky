import type { Account, MatchSummary, MatchDetail, Timeline } from '@shared/types'

/** Cursor options for one page of the match list (newest-first). */
export interface MatchPageOptions {
  /** Exclusive lower bound on `game_creation`; omit for the first page. */
  beforeCreation?: number
  /** Tiebreak for rows sharing `beforeCreation`. */
  beforeMatchId?: string
  limit: number
}

export interface MatchRepository {
  upsertAccount(account: Account): void
  getAccount(puuid: string): Account | null
  /** The single stored account for this single-user app, if synced yet. */
  getCurrentAccount(): Account | null
  insertMatch(summary: MatchSummary, rawJson: string): void
  hasMatch(matchId: string): boolean
  listMatches(puuid: string): MatchSummary[]
  /** One newest-first page using a (game_creation, match_id) cursor (US1). */
  listMatchesPage(puuid: string, opts: MatchPageOptions): MatchSummary[]
  /** Total stored matches for the player (drives the remote-extension heuristic). */
  countMatches(puuid: string): number
  getMatchDetail(matchId: string): MatchDetail | null
  /** Stored match details (with raw JSON), newest-first, up to `limit` (history cohorts). */
  listMatchDetails(puuid: string, limit: number): MatchDetail[]
  insertTimeline(timeline: Timeline): void
  getTimeline(matchId: string): Timeline | null
}
