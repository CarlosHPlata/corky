import type { SummonerProfile } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { SummonerDataSource } from '../ports/SummonerDataSource'
import type { SummonerRepository } from '../ports/SummonerRepository'

export class SyncSummonerProfile {
  constructor(
    private readonly summonerSource: SummonerDataSource,
    private readonly matchRepo: MatchRepository,
    private readonly summonerRepo: SummonerRepository
  ) {}

  async execute(): Promise<void> {
    // Operate on the active player (spec 006). The League client detection (or
    // the cached last-known player) already persisted the account + region/
    // platform, so we no longer re-resolve the account from static config.
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return // no active player yet (onboarding)

    const [profileData, soloRank] = await Promise.all([
      this.summonerSource.fetchProfile(account.puuid, account.platform),
      this.summonerSource.fetchSoloRank(account.puuid, account.platform)
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
