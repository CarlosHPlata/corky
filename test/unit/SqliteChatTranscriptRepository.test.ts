import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteChatTranscriptRepository } from '../../src/main/adapters/driven/sqlite/SqliteChatTranscriptRepository'
import type { ChatTurn } from '../../src/shared/types'

let db: Database.Database
let repo: SqliteChatTranscriptRepository

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = new SqliteChatTranscriptRepository(db)
})

afterEach(() => {
  db.close()
})

const turns: ChatTurn[] = [
  { role: 'assistant', text: 'What part of that felt repeatable?' },
  {
    role: 'user',
    text: 'I kept dying in river',
    refs: [{ id: 'marker:death#3', kind: 'marker', label: 'Death 3 — 14:20' }]
  }
]

describe('SqliteChatTranscriptRepository', () => {
  it('returns null when no session was ever saved', () => {
    expect(repo.get('missing')).toBeNull()
  })

  it('round-trips the transcript, including evidence refs on turns', () => {
    repo.save('KR_001', turns)
    expect(repo.get('KR_001')).toEqual({ turns, reflection: null })
  })

  it('upserts turns in place — one row per match', () => {
    repo.save('KR_001', turns)
    const longer = turns.concat({ role: 'assistant', text: 'Walk me through death three.' })
    repo.save('KR_001', longer)
    expect(repo.get('KR_001')?.turns).toEqual(longer)
    const count = (db.prepare('SELECT COUNT(*) AS n FROM chat_transcripts').get() as { n: number }).n
    expect(count).toBe(1)
  })

  it('saving turns preserves an existing reflection', () => {
    repo.save('KR_001', turns)
    repo.saveReflection('KR_001', 'I overstayed when ahead.')
    repo.save('KR_001', turns.concat({ role: 'user', text: 'one more thing' }))
    expect(repo.get('KR_001')?.reflection).toBe('I overstayed when ahead.')
  })

  it('saving the reflection preserves existing turns', () => {
    repo.save('KR_001', turns)
    repo.saveReflection('KR_001', 'I overstayed when ahead.')
    expect(repo.get('KR_001')).toEqual({ turns, reflection: 'I overstayed when ahead.' })
  })

  it('saving a reflection with no prior transcript creates the row with empty turns', () => {
    repo.saveReflection('KR_002', 'Short game, clean win.')
    expect(repo.get('KR_002')).toEqual({ turns: [], reflection: 'Short game, clean win.' })
  })

  it('updates the reflection in place on re-finalize', () => {
    repo.saveReflection('KR_001', 'first draft')
    repo.saveReflection('KR_001', 'second draft')
    expect(repo.get('KR_001')?.reflection).toBe('second draft')
  })

  it('tolerates corrupt stored json — reads back as empty turns', () => {
    db.prepare(
      `INSERT INTO chat_transcripts (match_id, json, reflection, updated_at)
       VALUES ('KR_BAD', 'not json {', 'still readable', 1)`
    ).run()
    expect(repo.get('KR_BAD')).toEqual({ turns: [], reflection: 'still readable' })
  })

  it('tolerates stored json that is not an array — reads back as empty turns', () => {
    db.prepare(
      `INSERT INTO chat_transcripts (match_id, json, reflection, updated_at)
       VALUES ('KR_OBJ', '{"oops":true}', NULL, 1)`
    ).run()
    expect(repo.get('KR_OBJ')).toEqual({ turns: [], reflection: null })
  })
})
