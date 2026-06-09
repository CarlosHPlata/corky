import type { SummonerProfile, LpSnapshot } from '@shared/types'

export interface SummonerRepository {
  saveProfile(profile: SummonerProfile): void
  getProfile(puuid: string): SummonerProfile | null
  appendLpSnapshot(puuid: string, snapshot: LpSnapshot): void
  getLpHistory(puuid: string): LpSnapshot[]
}
