import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteChatSessionRepository } from '../../src/main/adapters/driven/sqlite/SqliteChatSessionRepository'
import type { ChatTurn } from '../../src/shared/types'

let db: Database.Database
let repo: SqliteChatSessionRepository

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = new SqliteChatSessionRepository(db)
})

afterEach(() => {
  db.close()
})

const MATCH = 'EUW1_1'
const SESS = `${MATCH}-sess-abc`

function turnsWithProposal(resolution: 'pending' | 'accepted' = 'pending'): ChatTurn[] {
  return [
    { role: 'user', text: 'make the cs task stricter' },
    {
      role: 'assistant',
      text: 'drafted it',
      proposal: {
        id: `${SESS}-prop-1`,
        payload: { kind: 'create_reflection', text: 'note', refs: [] },
        resolution,
        ...(resolution !== 'pending' ? { resolvedAt: 5 } : {})
      }
    }
  ]
}

describe('SqliteChatSessionRepository', () => {
  it('lazily creates on first upsert and lists metas newest-first', () => {
    repo.upsert(`${MATCH}-sess-a`, MATCH, 'Chat · one', [{ role: 'user', text: 'hi' }])
    db.prepare('UPDATE chat_sessions SET created_at = 1 WHERE id = ?').run(`${MATCH}-sess-a`)
    repo.upsert(`${MATCH}-sess-b`, MATCH, 'Chat · two', [{ role: 'user', text: 'yo' }])
    const metas = repo.listMetas(MATCH)
    expect(metas.map((m) => m.title)).toEqual(['Chat · two', 'Chat · one'])
  })

  it('round-trips turns including embedded proposals', () => {
    repo.upsert(SESS, MATCH, 'T', turnsWithProposal())
    const got = repo.get(SESS)
    expect(got?.turns[1].proposal?.id).toBe(`${SESS}-prop-1`)
    expect(got?.turns[1].proposal?.resolution).toBe('pending')
  })

  it('returns null for corrupt stored turns (never an empty transcript)', () => {
    repo.upsert(SESS, MATCH, 'T', [])
    db.prepare("UPDATE chat_sessions SET turns_json = 'not json {' WHERE id = ?").run(SESS)
    expect(repo.get(SESS)).toBeNull()
  })

  it('resolveProposal flips pending exactly once and returns prior outcome after', () => {
    repo.upsert(SESS, MATCH, 'T', turnsWithProposal('pending'))
    expect(repo.resolveProposal(SESS, `${SESS}-prop-1`, 'accepted', 9)).toBe('accepted')
    // double-click: recorded outcome comes back, no flip to rejected
    expect(repo.resolveProposal(SESS, `${SESS}-prop-1`, 'rejected', 10)).toBe('accepted')
    expect(repo.get(SESS)?.turns[1].proposal?.resolution).toBe('accepted')
    expect(repo.get(SESS)?.turns[1].proposal?.resolvedAt).toBe(9)
  })

  it('resolveProposal returns null for unknown session or proposal', () => {
    expect(repo.resolveProposal('missing', 'p', 'accepted', 1)).toBeNull()
    repo.upsert(SESS, MATCH, 'T', turnsWithProposal())
    expect(repo.resolveProposal(SESS, 'nope', 'accepted', 1)).toBeNull()
  })

  it('upsert cannot change an already-resolved proposal back to pending', () => {
    repo.upsert(SESS, MATCH, 'T', turnsWithProposal('pending'))
    repo.resolveProposal(SESS, `${SESS}-prop-1`, 'rejected', 7)
    // renderer re-saves the transcript with the (stale) pending copy it held
    repo.upsert(SESS, MATCH, 'T', turnsWithProposal('pending'))
    expect(repo.get(SESS)?.turns[1].proposal?.resolution).toBe('rejected')
  })

  it('revertToPending puts an accepted proposal back to actionable', () => {
    repo.upsert(SESS, MATCH, 'T', turnsWithProposal('pending'))
    repo.resolveProposal(SESS, `${SESS}-prop-1`, 'accepted', 7)
    repo.revertToPending(SESS, `${SESS}-prop-1`)
    const prop = repo.get(SESS)?.turns[1].proposal
    expect(prop?.resolution).toBe('pending')
    expect(prop?.resolvedAt).toBeUndefined()
  })
})
