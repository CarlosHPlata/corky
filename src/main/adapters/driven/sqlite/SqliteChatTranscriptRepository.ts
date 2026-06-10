import type Database from 'better-sqlite3'
import type { ChatTurn } from '@shared/types'
import type {
  ChatTranscript,
  ChatTranscriptRepository
} from '../../../application/ports/ChatTranscriptRepository'

/** Tolerant parse of the stored ChatTurn[] — corrupt JSON reads as no turns. */
function parseTurns(json: string): ChatTurn[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as ChatTurn[]) : []
  } catch {
    return []
  }
}

/** Persists coaching-session transcripts, one row per match. Turns and the
 * finalized reflection upsert independently so neither write clobbers the other. */
export class SqliteChatTranscriptRepository implements ChatTranscriptRepository {
  constructor(private readonly db: Database.Database) {}

  get(matchId: string): ChatTranscript | null {
    const row = this.db
      .prepare('SELECT json, reflection FROM chat_transcripts WHERE match_id = ?')
      .get(matchId) as { json: string; reflection: string | null } | undefined
    if (!row) return null
    return { turns: parseTurns(row.json), reflection: row.reflection ?? null }
  }

  save(matchId: string, turns: ChatTurn[]): void {
    this.db
      .prepare(
        `INSERT INTO chat_transcripts (match_id, json, reflection, updated_at)
         VALUES (@matchId, @json, NULL, @now)
         ON CONFLICT(match_id) DO UPDATE SET json = @json, updated_at = @now`
      )
      .run({ matchId, json: JSON.stringify(turns), now: Date.now() })
  }

  saveReflection(matchId: string, reflection: string): void {
    this.db
      .prepare(
        `INSERT INTO chat_transcripts (match_id, json, reflection, updated_at)
         VALUES (@matchId, '[]', @reflection, @now)
         ON CONFLICT(match_id) DO UPDATE SET reflection = @reflection, updated_at = @now`
      )
      .run({ matchId, reflection, now: Date.now() })
  }
}
