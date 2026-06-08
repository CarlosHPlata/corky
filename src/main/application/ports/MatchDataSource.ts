import type { Account, MatchSummary, MatchDetail, Timeline } from '@shared/types'

export interface MatchDataSource {
  resolveAccount(riotId: string, platform: string, region: string): Promise<Account>
  listMatchIds(puuid: string, region: string, count: number): Promise<string[]>
  fetchMatchDetail(matchId: string, region: string): Promise<MatchDetail>
  fetchTimeline(matchId: string, region: string): Promise<Timeline>
}
