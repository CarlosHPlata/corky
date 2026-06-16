import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteSemanticMemory } from '../../src/main/adapters/driven/sqlite/SqliteSemanticMemory'
import type { SemanticObject } from '../../src/main/domain/memory/semanticObject'

const PUUID = 'puuid-1'

let db: Database.Database
let memory: SqliteSemanticMemory

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  memory = new SqliteSemanticMemory(db)
})

afterEach(() => {
  db.close()
})

function object(o: Partial<SemanticObject> = {}): SemanticObject {
  return {
    id: 'M1-mem-0', kind: 'pattern', statement: 'dies solo in river 14-20min',
    evidenceMatchIds: ['M1'], occurrences: 1, firstSeen: 100, lastSeen: 100,
    status: 'active', ...o
  }
}

describe('SqliteSemanticMemory', () => {
  it('upserts and queries a roundtrip, optional fields included', () => {
    const full = object({
      champion: 'Ahri', role: 'MIDDLE', phase: 'mid', metric: 'solo_deaths'
    })
    memory.upsert(PUUID, [full])
    expect(memory.query({ puuid: PUUID })).toEqual([full])
  })

  it('upserting the same id replaces the row in place', () => {
    memory.upsert(PUUID, [object()])
    memory.upsert(PUUID, [object({ statement: 'reworded', occurrences: 2, lastSeen: 200 })])
    const rows = memory.query({ puuid: PUUID })
    expect(rows).toHaveLength(1)
    expect(rows[0].statement).toBe('reworded')
    expect(rows[0].occurrences).toBe(2)
  })

  it('filters by kind, champion and status', () => {
    memory.upsert(PUUID, [
      object({ id: 'a', kind: 'pattern', champion: 'Ahri' }),
      object({ id: 'b', kind: 'strength', champion: 'Garen', statement: 'great dragon setups' }),
      object({ id: 'c', kind: 'weakness', status: 'resolved', statement: 'overstays after kills' })
    ])
    expect(memory.query({ puuid: PUUID, kinds: ['pattern'] }).map((o) => o.id)).toEqual(['a'])
    expect(memory.query({ puuid: PUUID, champion: 'Garen' }).map((o) => o.id)).toEqual(['b'])
    expect(memory.query({ puuid: PUUID, statuses: ['resolved'] }).map((o) => o.id)).toEqual(['c'])
  })

  it('defaults to active+confirmed statuses and scopes by puuid', () => {
    memory.upsert(PUUID, [
      object({ id: 'a', status: 'active' }),
      object({ id: 'b', status: 'confirmed', statement: 'great dragon setups' }),
      object({ id: 'c', status: 'stale', statement: 'overstays after kills' }),
      object({ id: 'd', status: 'resolved', statement: 'misses cannon waves' })
    ])
    memory.upsert('someone-else', [object({ id: 'e' })])
    const ids = memory.query({ puuid: PUUID }).map((o) => o.id)
    expect(ids.sort()).toEqual(['a', 'b'])
  })

  it('matches statement words via FTS, including after an update', () => {
    memory.upsert(PUUID, [
      object({ id: 'a', statement: 'dies solo in river 14-20min' }),
      object({ id: 'b', statement: 'great dragon setups' })
    ])
    memory.upsert(PUUID, [object({ id: 'b', statement: 'strong baron control' })])
    expect(memory.query({ puuid: PUUID, text: 'river' }).map((o) => o.id)).toEqual(['a'])
    expect(memory.query({ puuid: PUUID, text: 'baron' }).map((o) => o.id)).toEqual(['b'])
    expect(memory.query({ puuid: PUUID, text: 'dragon' })).toEqual([])
  })

  it('does not crash on quotes or FTS syntax in the text filter', () => {
    memory.upsert(PUUID, [object()])
    expect(() => memory.query({ puuid: PUUID, text: '"river AND (NOT' })).not.toThrow()
    expect(memory.query({ puuid: PUUID, text: 'river "solo"' }).map((o) => o.id)).toEqual(['M1-mem-0'])
    expect(memory.query({ puuid: PUUID, text: '   ' })).toHaveLength(1) // blank text = no FTS clause
  })

  it('orders by occurrences then recency and honours the limit (default 12)', () => {
    memory.upsert(PUUID, [
      object({ id: 'a', occurrences: 1, lastSeen: 300 }),
      object({ id: 'b', occurrences: 5, lastSeen: 100 }),
      object({ id: 'c', occurrences: 5, lastSeen: 200 })
    ])
    expect(memory.query({ puuid: PUUID }).map((o) => o.id)).toEqual(['c', 'b', 'a'])
    expect(memory.query({ puuid: PUUID, limit: 2 }).map((o) => o.id)).toEqual(['c', 'b'])
    const many = Array.from({ length: 15 }, (_, i) => object({ id: `m${i}` }))
    memory.upsert(PUUID, many)
    expect(memory.query({ puuid: PUUID })).toHaveLength(12)
  })

  it('setStatus moves the given ids and stamps last_seen', () => {
    memory.upsert(PUUID, [object({ id: 'a' }), object({ id: 'b' })])
    memory.setStatus(['a'], 'resolved', 999)
    expect(memory.query({ puuid: PUUID }).map((o) => o.id)).toEqual(['b'])
    const resolved = memory.query({ puuid: PUUID, statuses: ['resolved'] })
    expect(resolved).toHaveLength(1)
    expect(resolved[0].lastSeen).toBe(999)
  })
})
