import { describe, it, expect } from 'vitest'
import {
  sanitizeTaskProposal,
  sanitizeReflectionProposal,
  standingBaseline,
  isTaskProposalStale,
  isReflectionProposalStale,
  mintProposalId,
  REFLECTION_TEXT_CAP
} from '../../src/main/domain/chat/proposal'
import type { StandingFocusTask } from '../../src/shared/types'
import type { GeneratedTask } from '../../src/main/domain/report/focusTask'

const MATCH = 'EUW1_1'
const NOW = 1_749_550_000_000

function task(over: Partial<StandingFocusTask> & { id: string }): StandingFocusTask {
  return {
    description: 'Hold 6.5 cs/min',
    metric: 'cs_per_min',
    comparator: '>=',
    target: 6.5,
    scope: 'universal',
    status: 'active',
    sourceMatchId: MATCH,
    ...over
  }
}

function gen(over: Partial<GeneratedTask> = {}): GeneratedTask {
  return {
    description: 'Hold 6.5 cs/min',
    metric: 'cs_per_min',
    comparator: '>=',
    target: 6.5,
    scope: 'universal',
    ...over
  }
}

const STANDING = [
  task({ id: 'a' }),
  task({ id: 'b', metric: 'vision_score', target: 25, description: 'Vision 25+' })
]

describe('sanitizeTaskProposal', () => {
  it('maps an unchanged shape onto its existing id and detects the no-op', () => {
    const raw = { set: [gen(), gen({ metric: 'vision_score', target: 25, description: 'Vision 25+' })], retire: [] }
    expect(sanitizeTaskProposal(raw, STANDING, MATCH, NOW)).toBeNull()
  })

  it('accepts a real change and stamps the pre-change baseline', () => {
    const raw = { set: [gen({ target: 7, description: 'Hold 7 cs/min' }), gen({ metric: 'vision_score', target: 25, description: 'Vision 25+' })], retire: [] }
    const p = sanitizeTaskProposal(raw, STANDING, MATCH, NOW)
    expect(p).not.toBeNull()
    expect(p!.set.map((t) => t.target).sort((a, b) => a - b)).toEqual([7, 25])
    expect(p!.baseline).toBe(standingBaseline(STANDING))
  })

  it('drops tasks with non-computable metrics; suppresses when nothing survives', () => {
    const raw = { set: [gen({ metric: 'apm' as never })], retire: [] }
    expect(sanitizeTaskProposal(raw, STANDING, MATCH, NOW)).toBeNull()
  })

  it('folds back tasks omitted without an explicit retire (never empty-by-omission)', () => {
    // model "replaces" the whole set with one new task, retiring nothing
    const raw = { set: [gen({ metric: 'solo_deaths', comparator: '<=', target: 1, description: 'Max 1 solo death' })], retire: [] }
    const p = sanitizeTaskProposal(raw, STANDING, MATCH, NOW)!
    const metrics = p.set.map((t) => t.metric).sort()
    expect(metrics).toEqual(['cs_per_min', 'solo_deaths', 'vision_score'])
    expect(p.retireIds).toEqual([])
  })

  it('honors explicit retires and filters unknown retire ids', () => {
    const raw = {
      set: [gen({ metric: 'solo_deaths', comparator: '<=', target: 1, description: 'Max 1 solo death' })],
      retire: ['a', 'ghost']
    }
    const p = sanitizeTaskProposal(raw, STANDING, MATCH, NOW)!
    expect(p.retireIds).toEqual(['a'])
    expect(p.set.some((t) => t.id === 'a')).toBe(false)
    expect(p.set.some((t) => t.id === 'b')).toBe(true)
  })

  it('a same-lane replacement that is also explicitly retired survives (replace ≠ delete)', () => {
    // "Replace the cs task": the new task shares task a's lane (so it inherits a's
    // id) AND the model also lists a in retire. The retire must lose to the
    // in-place modification — otherwise the lane is deleted and its replacement
    // discarded, leaving the player with a task gone and nothing in its place.
    const raw = { set: [gen({ target: 7, description: 'Hold 7 cs/min' })], retire: ['a'] }
    const p = sanitizeTaskProposal(raw, STANDING, MATCH, NOW)!
    expect(p.retireIds).toEqual([]) // a is modified in place, not retired
    const cs = p.set.find((t) => t.metric === 'cs_per_min')!
    expect(cs.id).toBe('a') // replacement inherited the existing id
    expect(cs.target).toBe(7)
    expect(p.set.some((t) => t.id === 'b')).toBe(true)
    expect(p.set).toHaveLength(2)
  })

  it('suppresses a proposal that would empty a non-empty set', () => {
    const raw = { set: [], retire: ['a', 'b'] }
    expect(sanitizeTaskProposal(raw, STANDING, MATCH, NOW)).toBeNull()
  })

  it('caps the resulting set at 3, model-intended tasks first', () => {
    const standing = [
      task({ id: 'a' }),
      task({ id: 'b', metric: 'vision_score', target: 25 }),
      task({ id: 'c', metric: 'solo_deaths', comparator: '<=', target: 2 })
    ]
    const raw = {
      set: [
        gen({ metric: 'deaths', comparator: '<=', target: 4, description: 'Max 4 deaths' }),
        gen({ metric: 'kill_participation', target: 0.5, description: 'KP 50%+' }),
        gen({ metric: 'gold_at_14', target: 5000, description: '5k gold at 14' })
      ],
      retire: []
    }
    const p = sanitizeTaskProposal(raw, standing, MATCH, NOW)!
    expect(p.set).toHaveLength(3)
    expect(p.set.map((t) => t.metric)).toEqual(['deaths', 'kill_participation', 'gold_at_14'])
  })

  it('mints chat-seeded collision-proof ids for genuinely new tasks', () => {
    const raw = { set: [gen({ metric: 'deaths', comparator: '<=', target: 4, description: 'Max 4 deaths' })], retire: ['a', 'b'] }
    const p = sanitizeTaskProposal(raw, STANDING, MATCH, NOW)!
    expect(p.set[0].id.startsWith(`${MATCH}-chat-task-${NOW.toString(36)}`)).toBe(true)
  })
})

describe('sanitizeReflectionProposal', () => {
  const VALID = new Set(['marker:death#1', 'task:a'])
  const REFLECTIONS = [{ id: 'r1', updatedAt: 100 }]

  it('creates with filtered refs (unknown ids dropped silently)', () => {
    const p = sanitizeReflectionProposal(
      { kind: 'create_reflection', text: ' note ', refIds: ['marker:death#1', 'marker:ghost', 'task:a'] },
      VALID,
      REFLECTIONS
    )!
    expect(p.kind).toBe('create_reflection')
    if (p.kind === 'create_reflection') {
      expect(p.text).toBe('note')
      expect(p.refs.map((r) => r.id)).toEqual(['marker:death#1', 'task:a'])
      expect(p.refs.map((r) => r.kind)).toEqual(['marker', 'task'])
    }
  })

  it('suppresses empty text and caps long text', () => {
    expect(sanitizeReflectionProposal({ kind: 'create_reflection', text: '   ' }, VALID, REFLECTIONS)).toBeNull()
    const long = sanitizeReflectionProposal(
      { kind: 'create_reflection', text: 'x'.repeat(REFLECTION_TEXT_CAP + 500) },
      VALID,
      REFLECTIONS
    )!
    if (long.kind === 'create_reflection') expect(long.text).toHaveLength(REFLECTION_TEXT_CAP)
  })

  it('update targets an existing reflection and stamps its updatedAt baseline', () => {
    const p = sanitizeReflectionProposal(
      { kind: 'update_reflection', reflectionId: 'r1', text: 'edited' },
      VALID,
      REFLECTIONS
    )!
    expect(p.kind).toBe('update_reflection')
    if (p.kind === 'update_reflection') expect(p.baseline).toBe(100)
  })

  it('suppresses update/delete of unknown targets', () => {
    expect(
      sanitizeReflectionProposal({ kind: 'update_reflection', reflectionId: 'ghost', text: 'x' }, VALID, REFLECTIONS)
    ).toBeNull()
    expect(
      sanitizeReflectionProposal({ kind: 'delete_reflection', reflectionId: 'ghost' }, VALID, REFLECTIONS)
    ).toBeNull()
  })

  it('delete carries the target baseline', () => {
    const p = sanitizeReflectionProposal({ kind: 'delete_reflection', reflectionId: 'r1' }, VALID, REFLECTIONS)!
    if (p.kind === 'delete_reflection') expect(p.baseline).toBe(100)
  })
})

describe('staleness', () => {
  it('task proposal goes stale when the standing shape moves', () => {
    const p = sanitizeTaskProposal(
      { set: [gen({ target: 7, description: 'Hold 7' }), gen({ metric: 'vision_score', target: 25 })], retire: [] },
      STANDING,
      MATCH,
      NOW
    )!
    expect(isTaskProposalStale(p, STANDING)).toBe(false)
    const mutated = [STANDING[0], { ...STANDING[1], target: 30 }]
    expect(isTaskProposalStale(p, mutated)).toBe(true)
  })

  it('retired-elsewhere tasks change the baseline too', () => {
    const p = sanitizeTaskProposal(
      { set: [gen({ target: 7, description: 'Hold 7' }), gen({ metric: 'vision_score', target: 25 })], retire: [] },
      STANDING,
      MATCH,
      NOW
    )!
    const afterRetire = [STANDING[0], { ...STANDING[1], status: 'retired' as const }]
    expect(isTaskProposalStale(p, afterRetire)).toBe(true)
  })

  it('reflection update goes stale when the target was edited or deleted', () => {
    const p = sanitizeReflectionProposal(
      { kind: 'update_reflection', reflectionId: 'r1', text: 'edited' },
      new Set<string>(),
      [{ id: 'r1', updatedAt: 100 }]
    )!
    if (p.kind !== 'update_reflection') throw new Error('unexpected kind')
    expect(isReflectionProposalStale(p, { updatedAt: 100 })).toBe(false)
    expect(isReflectionProposalStale(p, { updatedAt: 200 })).toBe(true)
    expect(isReflectionProposalStale(p, null)).toBe(true)
  })

  it('creates are never baseline-stale', () => {
    const p = sanitizeReflectionProposal({ kind: 'create_reflection', text: 'n' }, new Set<string>(), [])!
    expect(isReflectionProposalStale(p, null)).toBe(false)
  })
})

describe('mintProposalId', () => {
  it('embeds the session and a timestamp segment', () => {
    expect(mintProposalId('s1', NOW)).toBe(`s1-prop-${NOW.toString(36)}`)
    expect(mintProposalId('s1', NOW)).not.toBe(mintProposalId('s1', NOW + 1))
  })
})
