import type { RankInfo } from '@shared/types'

export interface SummonerProfileData {
  profileIconId: number
  summonerLevel: number
}

export interface SummonerDataSource {
  /** summoner-v4 by-puuid (platform route) — icon + level. */
  fetchProfile(puuid: string, platform: string): Promise<SummonerProfileData>
  /** league-v4 entries by-puuid (platform route) — ranked solo standing, or null if unranked. */
  fetchSoloRank(puuid: string, platform: string): Promise<RankInfo | null>
}
