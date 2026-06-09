import type { Account, MatchSummary, MatchDetail, Timeline } from '@shared/types'

export interface MatchRepository {
  upsertAccount(account: Account): void
  getAccount(puuid: string): Account | null
  /** The single stored account for this single-user app, if synced yet. */
  getCurrentAccount(): Account | null
  insertMatch(summary: MatchSummary, rawJson: string): void
  hasMatch(matchId: string): boolean
  listMatches(puuid: string): MatchSummary[]
  getMatchDetail(matchId: string): MatchDetail | null
  insertTimeline(timeline: Timeline): void
  getTimeline(matchId: string): Timeline | null
}
