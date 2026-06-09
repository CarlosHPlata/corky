import type { MatchDataSource } from '../ports/MatchDataSource'
import type { MatchRepository } from '../ports/MatchRepository'
import { extractMatchSummary } from '../../domain/matchSummary'

export interface SyncRecentMatchesConfig {
  riotId: string
  platform: string
  region: string
}

export class SyncRecentMatches {
  constructor(
    private readonly dataSource: MatchDataSource,
    private readonly repository: MatchRepository,
    private readonly config: SyncRecentMatchesConfig
  ) {}

  async execute(count: number, start = 0): Promise<void> {
    const account = await this.dataSource.resolveAccount(
      this.config.riotId,
      this.config.platform,
      this.config.region
    )
    this.repository.upsertAccount(account)

    const matchIds = await this.dataSource.listMatchIds(
      account.puuid,
      this.config.region,
      count,
      start
    )
    const unseen = matchIds.filter((id) => !this.repository.hasMatch(id))

    for (const matchId of unseen) {
      const [detail, timeline] = await Promise.all([
        this.dataSource.fetchMatchDetail(matchId, this.config.region),
        this.dataSource.fetchTimeline(matchId, this.config.region)
      ])

      const raw = JSON.parse(detail.rawJson)
      const summary = extractMatchSummary(raw, account.puuid)

      this.repository.insertMatch(summary, detail.rawJson)
      this.repository.insertTimeline(timeline)
    }
  }
}
