import type { MatchSummary } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'

export class GetMatchList {
  constructor(private readonly repository: MatchRepository) {}

  execute(): MatchSummary[] {
    const account = this.repository.getCurrentAccount()
    if (!account) return []
    return this.repository.listMatches(account.puuid)
  }
}
