import type Database from 'better-sqlite3'
import type { EvidenceRef, Reflection, ReflectionSource } from '@shared/types'
import type { ReflectionRepository } from '../../../application/ports/ReflectionRepository'

interface Row {
  id: string
  match_id: string
  text: string
  refs_json: string
  source: string
  created_at: number
  updated_at: number
}

/** Tolerant parse of the stored EvidenceRef[] — corrupt JSON reads as no refs. */
function parseRefs(json: string): EvidenceRef[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as EvidenceRef[]) : []
  } catch {
    return []
  }
}

function toReflection(row: Row): Reflection {
  return {
    id: row.id,
    matchId: row.match_id,
    text: row.text,
    refs: parseRefs(row.refs_json),
    source: (row.source === 'coach' ? 'coach' : 'player') as ReflectionSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** Persists per-match reflections (spec 005), one row each. */
export class SqliteReflectionRepository implements ReflectionRepository {
  constructor(private readonly db: Database.Database) {}

  list(matchId: string): Reflection[] {
    const rows = this.db
      .prepare('SELECT * FROM reflections WHERE match_id = ? ORDER BY created_at ASC, id ASC')
      .all(matchId) as Row[]
    return rows.map(toReflection)
  }

  get(id: string): Reflection | null {
    const row = this.db.prepare('SELECT * FROM reflections WHERE id = ?').get(id) as Row | undefined
    return row ? toReflection(row) : null
  }

  upsert(reflection: Reflection): void {
    this.db
      .prepare(
        `INSERT INTO reflections (id, match_id, text, refs_json, source, created_at, updated_at)
         VALUES (@id, @matchId, @text, @refs, @source, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           text = @text, refs_json = @refs, updated_at = @updatedAt`
      )
      .run({
        id: reflection.id,
        matchId: reflection.matchId,
        text: reflection.text,
        refs: JSON.stringify(reflection.refs),
        source: reflection.source,
        createdAt: reflection.createdAt,
        updatedAt: reflection.updatedAt
      })
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM reflections WHERE id = ?').run(id)
  }

  countForMatch(matchId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM reflections WHERE match_id = ?')
      .get(matchId) as { n: number }
    return row.n
  }
}
