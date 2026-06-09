import type Database from 'better-sqlite3'
import type { SessionAnalysis } from '@shared/types'
import type { SessionAnalysisRepository } from '../../../application/ports/SessionAnalysisRepository'

export class SqliteSessionAnalysisRepository implements SessionAnalysisRepository {
  constructor(private readonly db: Database.Database) {}

  save(puuid: string, analysis: SessionAnalysis): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO session_analyses (puuid, created_at, model, json)
         VALUES (?, ?, ?, ?)`
      )
      .run(puuid, analysis.generatedAt, analysis.model, JSON.stringify(analysis))
  }

  getLatest(puuid: string): SessionAnalysis | null {
    const row = this.db
      .prepare('SELECT json FROM session_analyses WHERE puuid = ?')
      .get(puuid) as { json: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.json) as SessionAnalysis
    } catch {
      return null
    }
  }
}
