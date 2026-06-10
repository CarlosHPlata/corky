import type Database from 'better-sqlite3'
import type { Account, MatchSummary, MatchDetail, Timeline } from '@shared/types'
import type { MatchRepository, MatchPageOptions } from '../../../application/ports/MatchRepository'
import { extractMatchSummary } from '../../../domain/matchSummary'

function toAccount(row: Record<string, string>): Account {
  return {
    puuid: row.puuid,
    gameName: row.game_name,
    tagLine: row.tag_line,
    platform: row.platform,
    region: row.region
  }
}

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
    return row ? toAccount(row) : null
  }

  getCurrentAccount(): Account | null {
    const row = this.db
      .prepare('SELECT * FROM account LIMIT 1')
      .get() as Record<string, string> | undefined
    return row ? toAccount(row) : null
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
      .prepare('SELECT raw_json FROM matches WHERE puuid = ? ORDER BY game_creation DESC')
      .all(puuid) as { raw_json: string }[]
    return rows.map((r) => extractMatchSummary(JSON.parse(r.raw_json), puuid))
  }

  listMatchesPage(puuid: string, opts: MatchPageOptions): MatchSummary[] {
    const hasCursor = opts.beforeCreation !== undefined && opts.beforeMatchId !== undefined
    const sql = hasCursor
      ? `SELECT raw_json FROM matches
         WHERE puuid = ?
           AND (game_creation < ? OR (game_creation = ? AND match_id < ?))
         ORDER BY game_creation DESC, match_id DESC
         LIMIT ?`
      : `SELECT raw_json FROM matches
         WHERE puuid = ?
         ORDER BY game_creation DESC, match_id DESC
         LIMIT ?`
    const rows = (
      hasCursor
        ? this.db
            .prepare(sql)
            .all(puuid, opts.beforeCreation, opts.beforeCreation, opts.beforeMatchId, opts.limit)
        : this.db.prepare(sql).all(puuid, opts.limit)
    ) as { raw_json: string }[]
    return rows.map((r) => extractMatchSummary(JSON.parse(r.raw_json), puuid))
  }

  countMatches(puuid: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM matches WHERE puuid = ?')
      .get(puuid) as { n: number }
    return row.n
  }

  getMatchDetail(matchId: string): MatchDetail | null {
    const row = this.db
      .prepare('SELECT match_id, raw_json FROM matches WHERE match_id = ?')
      .get(matchId) as Record<string, string> | undefined
    if (!row) return null
    return { matchId: row.match_id, rawJson: row.raw_json }
  }

  listMatchDetails(puuid: string, limit: number): MatchDetail[] {
    const rows = this.db
      .prepare(
        `SELECT match_id, raw_json FROM matches
         WHERE puuid = ?
         ORDER BY game_creation DESC, match_id DESC
         LIMIT ?`
      )
      .all(puuid, limit) as Record<string, string>[]
    return rows.map((r) => ({ matchId: r.match_id, rawJson: r.raw_json }))
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
