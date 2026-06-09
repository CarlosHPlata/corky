import type { Account, MatchSummary, MatchDetail, Timeline } from '@shared/types'

export interface MatchDataSource {
  resolveAccount(riotId: string, platform: string, region: string): Promise<Account>
  /** `start` is the match-v5 offset; pass it to page into older history (US1). */
  listMatchIds(puuid: string, region: string, count: number, start?: number): Promise<string[]>
  fetchMatchDetail(matchId: string, region: string): Promise<MatchDetail>
  fetchTimeline(matchId: string, region: string): Promise<Timeline>
}
