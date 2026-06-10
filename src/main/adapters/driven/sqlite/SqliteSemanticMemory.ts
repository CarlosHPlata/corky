import type Database from 'better-sqlite3'
import type { SemanticObject, SemanticObjectStatus } from '../../../domain/memory/semanticObject'
import type { SemanticMemory, SemanticMemoryFilter } from '../../../application/ports/SemanticMemory'

const DEFAULT_STATUSES: SemanticObjectStatus[] = ['active', 'confirmed']
const DEFAULT_LIMIT = 12

/** Persists the player's Semantic Object Memory, with FTS recall over statements. */
export class SqliteSemanticMemory implements SemanticMemory {
  constructor(private readonly db: Database.Database) {}

  upsert(puuid: string, objects: SemanticObject[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO semantic_objects
         (id, puuid, kind, champion, role, phase, metric, statement, evidence_json,
          occurrences, first_seen, last_seen, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind, champion = excluded.champion, role = excluded.role,
         phase = excluded.phase, metric = excluded.metric, statement = excluded.statement,
         evidence_json = excluded.evidence_json, occurrences = excluded.occurrences,
         last_seen = excluded.last_seen, status = excluded.status`
    )
    const upsertAll = this.db.transaction((os: SemanticObject[]) => {
      for (const o of os) {
        stmt.run(
          o.id, puuid, o.kind, o.champion ?? null, o.role ?? null, o.phase ?? null,
          o.metric ?? null, o.statement, JSON.stringify(o.evidenceMatchIds),
          o.occurrences, o.firstSeen, o.lastSeen, o.status
        )
      }
    })
    upsertAll(objects)
  }

  query(filter: SemanticMemoryFilter): SemanticObject[] {
    const where: string[] = ['puuid = ?']
    const params: unknown[] = [filter.puuid]

    const statuses = filter.statuses?.length ? filter.statuses : DEFAULT_STATUSES
    where.push(`status IN (${statuses.map(() => '?').join(', ')})`)
    params.push(...statuses)

    if (filter.kinds?.length) {
      where.push(`kind IN (${filter.kinds.map(() => '?').join(', ')})`)
      params.push(...filter.kinds)
    }
    if (filter.champion) {
      where.push('champion = ?')
      params.push(filter.champion)
    }
    if (filter.role) {
      where.push('role = ?')
      params.push(filter.role)
    }
    if (filter.phase) {
      where.push('phase = ?')
      params.push(filter.phase)
    }
    if (filter.metric) {
      where.push('metric = ?')
      params.push(filter.metric)
    }
    const match = filter.text ? toFtsQuery(filter.text) : ''
    if (match) {
      where.push('rowid IN (SELECT rowid FROM semantic_objects_fts WHERE semantic_objects_fts MATCH ?)')
      params.push(match)
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM semantic_objects
         WHERE ${where.join(' AND ')}
         ORDER BY occurrences DESC, last_seen DESC
         LIMIT ?`
      )
      .all(...params, filter.limit ?? DEFAULT_LIMIT) as Record<string, unknown>[]
    return rows.map(toSemanticObject)
  }

  setStatus(ids: string[], status: SemanticObjectStatus, at: number): void {
    if (!ids.length) return
    const stmt = this.db.prepare(
      'UPDATE semantic_objects SET status = ?, last_seen = ? WHERE id = ?'
    )
    const setAll = this.db.transaction((xs: string[]) => {
      for (const id of xs) stmt.run(status, at, id)
    })
    setAll(ids)
  }
}

/**
 * FTS5 has its own query grammar; raw user text (quotes, AND/OR/NOT, hyphens)
 * would be a syntax error. Quote every term — doubling embedded quotes per the
 * FTS escaping rule — so the query is always a plain ANDed bag of words.
 */
function toFtsQuery(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(' ')
}

function toSemanticObject(r: Record<string, unknown>): SemanticObject {
  return {
    id: r.id as string,
    kind: r.kind as SemanticObject['kind'],
    champion: (r.champion as string | null) ?? undefined,
    role: (r.role as string | null) ?? undefined,
    phase: (r.phase as SemanticObject['phase'] | null) ?? undefined,
    metric: (r.metric as string | null) ?? undefined,
    statement: r.statement as string,
    evidenceMatchIds: parseEvidence(r.evidence_json as string),
    occurrences: r.occurrences as number,
    firstSeen: r.first_seen as number,
    lastSeen: r.last_seen as number,
    status: r.status as SemanticObject['status']
  }
}

function parseEvidence(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
