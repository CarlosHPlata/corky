import type { MatchDataSource } from '../ports/MatchDataSource'
import type { MatchRepository } from '../ports/MatchRepository'
import { extractMatchSummary } from '../../domain/matchSummary'

export class SyncRecentMatches {
  constructor(
    private readonly dataSource: MatchDataSource,
    private readonly repository: MatchRepository
  ) {}

  async execute(count: number, start = 0): Promise<void> {
    // Identity now comes from the active player (spec 006): the League client
    // detection (or the cached last-known player) already resolved + persisted
    // the account, so we read it here instead of re-resolving from static config.
    const account = this.repository.getCurrentAccount()
    if (!account) return // no active player yet (onboarding) — nothing to sync

    const matchIds = await this.dataSource.listMatchIds(
      account.puuid,
      account.region,
      count,
      start
    )
    const unseen = matchIds.filter((id) => !this.repository.hasMatch(id))

    for (const matchId of unseen) {
      const [detail, timeline] = await Promise.all([
        this.dataSource.fetchMatchDetail(matchId, account.region),
        this.dataSource.fetchTimeline(matchId, account.region)
      ])

      const raw = JSON.parse(detail.rawJson)
      const summary = extractMatchSummary(raw, account.puuid)

      this.repository.insertMatch(summary, detail.rawJson)
      this.repository.insertTimeline(timeline)
    }
  }
}
