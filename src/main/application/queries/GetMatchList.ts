import type { MatchSummary } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'

export class GetMatchList {
  constructor(
    private readonly repository: MatchRepository,
    private readonly puuid: string
  ) {}

  execute(): MatchSummary[] {
    return this.repository.listMatches(this.puuid)
  }
}
