import type Database from 'better-sqlite3'
import type { Account, MatchSummary, MatchDetail, Timeline } from '@shared/types'
import type { MatchRepository } from '../../../application/ports/MatchRepository'

export class SqliteMatchRepository implements MatchRepository {
  constructor(private readonly db: Database.Database) {}

  upsertAccount(account: Account): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO account (puuid, game_name, tag_line, platform, region)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(account.puuid, account.gameName, account.tagLine, account.platform, account.region)
  }

  getAccount(puuid: string): Account | null {
    const row = this.db
      .prepare('SELECT * FROM account WHERE puuid = ?')
      .get(puuid) as Record<string, string> | undefined
    if (!row) return null
    return {
      puuid: row.puuid,
      gameName: row.game_name,
      tagLine: row.tag_line,
      platform: row.platform,
      region: row.region
    }
  }

  insertMatch(summary: MatchSummary, rawJson: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO matches
         (match_id, puuid, queue, champion, win, game_creation, game_duration, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        summary.matchId,
        summary.puuid,
        summary.queue,
        summary.champion,
        summary.win ? 1 : 0,
        summary.gameCreation,
        summary.gameDuration,
        rawJson
      )
  }

  hasMatch(matchId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM matches WHERE match_id = ?')
      .get(matchId)
    return row !== undefined
  }

  listMatches(puuid: string): MatchSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM matches WHERE puuid = ? ORDER BY game_creation DESC')
      .all(puuid) as Record<string, unknown>[]
    return rows.map((r) => ({
      matchId: r.match_id as string,
      puuid: r.puuid as string,
      queue: r.queue as number,
      champion: r.champion as string,
      win: (r.win as number) === 1,
      gameCreation: r.game_creation as number,
      gameDuration: r.game_duration as number
    }))
  }

  getMatchDetail(matchId: string): MatchDetail | null {
    const row = this.db
      .prepare('SELECT match_id, raw_json FROM matches WHERE match_id = ?')
      .get(matchId) as Record<string, string> | undefined
    if (!row) return null
    return { matchId: row.match_id, rawJson: row.raw_json }
  }

  insertTimeline(timeline: Timeline): void {
    this.db
      .prepare('INSERT OR IGNORE INTO timelines (match_id, raw_json) VALUES (?, ?)')
      .run(timeline.matchId, timeline.rawJson)
  }

  getTimeline(matchId: string): Timeline | null {
    const row = this.db
      .prepare('SELECT * FROM timelines WHERE match_id = ?')
      .get(matchId) as Record<string, string> | undefined
    if (!row) return null
    return { matchId: row.match_id, rawJson: row.raw_json }
  }
}
