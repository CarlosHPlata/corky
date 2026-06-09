import type { SummonerProfile } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { SummonerRepository } from '../ports/SummonerRepository'

export class GetSummonerProfile {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly summonerRepo: SummonerRepository
  ) {}

  execute(): SummonerProfile | null {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return null
    return this.summonerRepo.getProfile(account.puuid)
  }
}
