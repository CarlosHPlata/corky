import { describe, it, expect } from 'vitest'
import {
  isValidProposedObject,
  subjectKey,
  mergeSemanticObjects
} from '../../src/main/domain/memory/semanticObject'
import type {
  ProposedSemanticObject,
  SemanticObject
} from '../../src/main/domain/memory/semanticObject'

function proposed(o: Partial<ProposedSemanticObject> = {}): ProposedSemanticObject {
  return { kind: 'pattern', statement: 'dies solo in river 14-20min', ...o }
}

function existing(o: Partial<SemanticObject> = {}): SemanticObject {
  return {
    id: 'M1-mem-0', kind: 'pattern', statement: 'dies solo in river 14-20min',
    evidenceMatchIds: ['M1'], occurrences: 1, firstSeen: 100, lastSeen: 100,
    status: 'active', ...o
  }
}

describe('isValidProposedObject', () => {
  it('accepts a well-formed proposal', () => {
    expect(isValidProposedObject(proposed())).toBe(true)
  })

  it('rejects an unknown kind', () => {
    expect(isValidProposedObject(proposed({ kind: 'vibe' as never }))).toBe(false)
  })

  it('rejects an empty or whitespace-only statement', () => {
    expect(isValidProposedObject(proposed({ statement: '' }))).toBe(false)
    expect(isValidProposedObject(proposed({ statement: '   ' }))).toBe(false)
  })

  it('rejects a statement over 240 chars after trim', () => {
    expect(isValidProposedObject(proposed({ statement: 'x'.repeat(241) }))).toBe(false)
    expect(isValidProposedObject(proposed({ statement: ` ${'x'.repeat(240)} ` }))).toBe(true)
  })
})

describe('subjectKey', () => {
  it('lowercases champion and role so spelling drift shares a subject', () => {
    const a = subjectKey(proposed({ champion: 'Ahri', role: 'MIDDLE' }))
    const b = subjectKey(proposed({ champion: 'ahri', role: 'middle' }))
    expect(a).toBe(b)
  })

  it('treats absent dimensions as empty segments', () => {
    expect(subjectKey(proposed())).toBe('pattern||||')
  })
})

describe('mergeSemanticObjects', () => {
  it('mints a new object for a genuinely new subject', () => {
    const out = mergeSemanticObjects([proposed()], [], 'M2', 500)
    expect(out).toEqual([
      {
        id: `M2-mem-${(500).toString(36)}-0`, kind: 'pattern', statement: 'dies solo in river 14-20min',
        evidenceMatchIds: ['M2'], occurrences: 1, firstSeen: 500, lastSeen: 500,
        status: 'active'
      }
    ])
  })

  it('updates a same-subject object: occurrences+1, statement refreshed, evidence appended', () => {
    const out = mergeSemanticObjects(
      [proposed({ statement: 'still dies solo in river, now 12-22min' })],
      [existing()],
      'M2',
      500
    )
    expect(out).toEqual([
      existing({
        statement: 'still dies solo in river, now 12-22min',
        evidenceMatchIds: ['M1', 'M2'],
        occurrences: 2,
        lastSeen: 500
      })
    ])
  })

  it('drops invalid proposals without disturbing the rest', () => {
    const out = mergeSemanticObjects(
      [proposed({ statement: '' }), proposed({ kind: 'strength', statement: 'great dragon setups' })],
      [],
      'M2',
      500
    )
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(`M2-mem-${(500).toString(36)}-1`) // index follows the proposed array, not the survivors
    expect(out[0].statement).toBe('great dragon setups')
  })

  it('dedupes proposals sharing a subject within one call (first wins)', () => {
    const out = mergeSemanticObjects(
      [proposed({ statement: 'first wording' }), proposed({ statement: 'second wording' })],
      [],
      'M2',
      500
    )
    expect(out).toHaveLength(1)
    expect(out[0].statement).toBe('first wording')
  })

  it('revives a stale object to active; other statuses are kept', () => {
    const [revived] = mergeSemanticObjects([proposed()], [existing({ status: 'stale' })], 'M2', 500)
    expect(revived.status).toBe('active')
    const [confirmed] = mergeSemanticObjects([proposed()], [existing({ status: 'confirmed' })], 'M2', 500)
    expect(confirmed.status).toBe('confirmed')
  })

  it('never matches a resolved object — a new one is minted instead', () => {
    const out = mergeSemanticObjects([proposed()], [existing({ status: 'resolved' })], 'M2', 500)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(`M2-mem-${(500).toString(36)}-0`)
    expect(out[0].occurrences).toBe(1)
  })

  it('caps evidence at the 10 most recent and never duplicates the source match', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `M${i}`)
    const [capped] = mergeSemanticObjects([proposed()], [existing({ evidenceMatchIds: ids })], 'M99', 500)
    expect(capped.evidenceMatchIds).toEqual([...ids.slice(1), 'M99'])
    const [same] = mergeSemanticObjects([proposed()], [existing({ evidenceMatchIds: ['M1', 'M2'] })], 'M2', 500)
    expect(same.evidenceMatchIds).toEqual(['M1', 'M2'])
  })

  it('returns only the touched rows — unmatched existing objects are left alone', () => {
    const untouched = existing({ id: 'other', kind: 'strength', statement: 'great dragon setups' })
    const out = mergeSemanticObjects([proposed()], [untouched, existing()], 'M2', 500)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('M1-mem-0')
  })
})
