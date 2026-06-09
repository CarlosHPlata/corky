import type { SummonerProfile } from '@shared/types'
import type { MatchDataSource } from '../ports/MatchDataSource'
import type { MatchRepository } from '../ports/MatchRepository'
import type { SummonerDataSource } from '../ports/SummonerDataSource'
import type { SummonerRepository } from '../ports/SummonerRepository'

export interface SyncSummonerProfileConfig {
  riotId: string
  platform: string
  region: string
}

export class SyncSummonerProfile {
  constructor(
    private readonly accountSource: MatchDataSource,
    private readonly summonerSource: SummonerDataSource,
    private readonly matchRepo: MatchRepository,
    private readonly summonerRepo: SummonerRepository,
    private readonly config: SyncSummonerProfileConfig
  ) {}

  async execute(): Promise<void> {
    const account = await this.accountSource.resolveAccount(
      this.config.riotId,
      this.config.platform,
      this.config.region
    )
    this.matchRepo.upsertAccount(account)

    const [profileData, soloRank] = await Promise.all([
      this.summonerSource.fetchProfile(account.puuid, this.config.platform),
      this.summonerSource.fetchSoloRank(account.puuid, this.config.platform)
    ])

    const profile: SummonerProfile = {
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform: account.platform,
      region: account.region,
      profileIconId: profileData.profileIconId,
      summonerLevel: profileData.summonerLevel,
      soloRank
    }
    this.summonerRepo.saveProfile(profile)

    // Record an LP point only when ranked, and only when it actually moved —
    // keeps the trajectory chart meaningful instead of a flat row of dupes.
    if (soloRank) {
      const history = this.summonerRepo.getLpHistory(account.puuid)
      const last = history[history.length - 1]
      const moved =
        !last ||
        last.tier !== soloRank.tier ||
        last.division !== soloRank.division ||
        last.leaguePoints !== soloRank.leaguePoints
      if (moved) {
        this.summonerRepo.appendLpSnapshot(account.puuid, {
          ts: Date.now(),
          tier: soloRank.tier,
          division: soloRank.division,
          leaguePoints: soloRank.leaguePoints
        })
      }
    }
  }
}
