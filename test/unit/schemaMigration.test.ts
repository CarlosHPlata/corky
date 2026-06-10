import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'

// Spec 005 legacy adoption: chat_transcripts rows become the first session and
// the first reflection of their match, idempotently (deterministic '-legacy'
// ids + INSERT OR IGNORE). runMigrations executes on every startup, so running
// it repeatedly must never duplicate or resurrect anything.

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
})

afterEach(() => {
  db.close()
})

/** Seed a spec-004 shaped transcript row BEFORE the 005 migration acts on it.
 * runMigrations creates the table on first call, so call it once, seed, then
 * re-run to exercise adoption. */
function seedLegacy(matchId: string, json: string | null, reflection: string | null): void {
  db.prepare(
    `INSERT OR REPLACE INTO chat_transcripts (match_id, json, reflection, updated_at)
     VALUES (?, ?, ?, 1700000000000)`
  ).run(matchId, json ?? '[]', reflection)
}

const TURNS = JSON.stringify([
  { role: 'assistant', text: 'opener' },
  { role: 'user', text: 'I kept dying in river' }
])

describe('spec 005 legacy migration', () => {
  it('adopts a legacy transcript as the first session of its match', () => {
    runMigrations(db)
    seedLegacy('KR_001', TURNS, null)
    runMigrations(db)
    const row = db
      .prepare('SELECT * FROM chat_sessions WHERE match_id = ?')
      .get('KR_001') as { id: string; title: string; turns_json: string }
    expect(row.id).toBe('KR_001-sess-legacy')
    expect(row.title).toBe('First session')
    expect(JSON.parse(row.turns_json)).toHaveLength(2)
  })

  it('adopts a legacy reflection as the first reflection, source coach, no refs', () => {
    runMigrations(db)
    seedLegacy('KR_001', TURNS, 'I overstayed when ahead.')
    runMigrations(db)
    const row = db
      .prepare('SELECT * FROM reflections WHERE match_id = ?')
      .get('KR_001') as { id: string; text: string; refs_json: string; source: string }
    expect(row.id).toBe('KR_001-refl-legacy')
    expect(row.text).toBe('I overstayed when ahead.')
    expect(row.refs_json).toBe('[]')
    expect(row.source).toBe('coach')
  })

  it('is idempotent — re-running never duplicates rows', () => {
    runMigrations(db)
    seedLegacy('KR_001', TURNS, 'reflection text')
    runMigrations(db)
    runMigrations(db)
    runMigrations(db)
    const sessions = (db.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get() as { n: number }).n
    const reflections = (db.prepare('SELECT COUNT(*) AS n FROM reflections').get() as { n: number }).n
    expect(sessions).toBe(1)
    expect(reflections).toBe(1)
  })

  it('re-running does not clobber adopted rows that have since been edited', () => {
    runMigrations(db)
    seedLegacy('KR_001', TURNS, 'original')
    runMigrations(db)
    db.prepare("UPDATE reflections SET text = 'edited by player' WHERE id = 'KR_001-refl-legacy'").run()
    db.prepare("UPDATE chat_sessions SET turns_json = '[]' WHERE id = 'KR_001-sess-legacy'").run()
    runMigrations(db)
    const refl = db
      .prepare("SELECT text FROM reflections WHERE id = 'KR_001-refl-legacy'")
      .get() as { text: string }
    const sess = db
      .prepare("SELECT turns_json FROM chat_sessions WHERE id = 'KR_001-sess-legacy'")
      .get() as { turns_json: string }
    expect(refl.text).toBe('edited by player')
    expect(sess.turns_json).toBe('[]')
  })

  it('skips empty transcripts and blank reflections', () => {
    runMigrations(db)
    seedLegacy('KR_EMPTY', '[]', '   ')
    seedLegacy('KR_NULLREFL', TURNS, null)
    runMigrations(db)
    const sessions = db.prepare('SELECT match_id FROM chat_sessions').all() as { match_id: string }[]
    const reflections = db.prepare('SELECT match_id FROM reflections').all() as { match_id: string }[]
    expect(sessions.map((s) => s.match_id)).toEqual(['KR_NULLREFL'])
    expect(reflections).toHaveLength(0)
  })

  it('adopts transcript and reflection independently from one row', () => {
    runMigrations(db)
    seedLegacy('KR_BOTH', TURNS, 'kept the lead this time')
    runMigrations(db)
    expect(db.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM reflections').get()).toEqual({ n: 1 })
  })
})
