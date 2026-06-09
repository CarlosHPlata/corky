import type Database from 'better-sqlite3'
import type { SummonerProfile, LpSnapshot } from '@shared/types'
import type { SummonerRepository } from '../../../application/ports/SummonerRepository'

export class SqliteSummonerRepository implements SummonerRepository {
  constructor(private readonly db: Database.Database) {}

  saveProfile(profile: SummonerProfile): void {
    const rank = profile.soloRank
    this.db
      .prepare(
        `INSERT OR REPLACE INTO summoner_profile
         (puuid, game_name, tag_line, platform, region, profile_icon_id, summoner_level,
          queue_type, tier, division, league_points, wins, losses, updated_at)
         VALUES (@puuid, @gameName, @tagLine, @platform, @region, @profileIconId, @summonerLevel,
          @queueType, @tier, @division, @leaguePoints, @wins, @losses, @updatedAt)`
      )
      .run({
        puuid: profile.puuid,
        gameName: profile.gameName,
        tagLine: profile.tagLine,
        platform: profile.platform,
        region: profile.region,
        profileIconId: profile.profileIconId,
        summonerLevel: profile.summonerLevel,
        queueType: rank?.queueType ?? null,
        tier: rank?.tier ?? null,
        division: rank?.division ?? null,
        leaguePoints: rank?.leaguePoints ?? null,
        wins: rank?.wins ?? null,
        losses: rank?.losses ?? null,
        updatedAt: Date.now()
      })
  }

  getProfile(puuid: string): SummonerProfile | null {
    const row = this.db
      .prepare('SELECT * FROM summoner_profile WHERE puuid = ?')
      .get(puuid) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      puuid: row.puuid as string,
      gameName: row.game_name as string,
      tagLine: row.tag_line as string,
      platform: row.platform as string,
      region: row.region as string,
      profileIconId: row.profile_icon_id as number,
      summonerLevel: row.summoner_level as number,
      soloRank:
        row.tier == null
          ? null
          : {
              queueType: row.queue_type as string,
              tier: row.tier as string,
              division: row.division as string,
              leaguePoints: row.league_points as number,
              wins: row.wins as number,
              losses: row.losses as number
            }
    }
  }

  appendLpSnapshot(puuid: string, snapshot: LpSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO lp_snapshots (puuid, ts, tier, division, league_points)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(puuid, snapshot.ts, snapshot.tier, snapshot.division, snapshot.leaguePoints)
  }

  getLpHistory(puuid: string): LpSnapshot[] {
    const rows = this.db
      .prepare(
        'SELECT ts, tier, division, league_points FROM lp_snapshots WHERE puuid = ? ORDER BY ts ASC'
      )
      .all(puuid) as Record<string, unknown>[]
    return rows.map((r) => ({
      ts: r.ts as number,
      tier: r.tier as string,
      division: r.division as string,
      leaguePoints: r.league_points as number
    }))
  }
}
