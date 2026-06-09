import type { LpSnapshot } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { SummonerRepository } from '../ports/SummonerRepository'

export class GetLpHistory {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly summonerRepo: SummonerRepository
  ) {}

  execute(): LpSnapshot[] {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return []
    return this.summonerRepo.getLpHistory(account.puuid)
  }
}
