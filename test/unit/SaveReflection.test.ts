import { describe, it, expect, vi } from 'vitest'
import { SaveReflection } from '../../src/main/application/commands/SaveReflection'
import { DeleteReflection } from '../../src/main/application/commands/DeleteReflection'
import { MatchService } from '../../src/main/application/services/Match/MatchService'
import type { Reflection, StandingFocusTask } from '../../src/shared/types'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const MATCH = 'WIN_001'
const NOW = 1_749_550_000_000

const TASK: StandingFocusTask = {
  id: 'task-1', description: 'Vision 25+', metric: 'vision_score', comparator: '>=', target: 25,
  scope: 'universal', status: 'active', sourceMatchId: MATCH
}

function makeFakes(existing: Reflection[] = []) {
  const rows = new Map(existing.map((r) => [r.id, r]))
  const reflections = {
    list: vi.fn(() => [...rows.values()]),
    get: vi.fn((id: string) => rows.get(id) ?? null),
    upsert: vi.fn((r: Reflection) => { rows.set(r.id, r) }),
    delete: vi.fn((id: string) => { rows.delete(id) }),
    countForMatch: vi.fn(() => rows.size)
  }
  const matchRepo = {
    getCurrentAccount: () => ({ puuid: PLAYER_PUUID }),
    getMatchDetail: () => ({ matchId: MATCH, rawJson: JSON.stringify(loadMatch(MATCH)) }),
    getTimeline: () => ({ matchId: MATCH, rawJson: JSON.stringify(loadTimeline(MATCH)) })
  } as never
  const reportRepo = { getStandingTasks: () => [TASK], getMatchAnalysis: () => null } as never
  const goalRepo = { get: () => null } as never
  const itemCatalog = { getItemNames: async () => new Map() } as never
  const matchService = new MatchService(matchRepo, reportRepo, goalRepo, reflections as never, itemCatalog)
  const cmd = new SaveReflection(matchRepo, reportRepo, reflections as never, matchService, () => NOW)
  return { cmd, reflections, rows }
}

describe('SaveReflection', () => {
  it('creates a player reflection with a collision-proof id', async () => {
    const { cmd } = makeFakes()
    const r = await cmd.execute({ matchId: MATCH, text: '  shove only with vision  ', refs: [] })
    expect(r.id).toBe(`${MATCH}-refl-${NOW.toString(36)}-0`)
    expect(r.source).toBe('player')
    expect(r.text).toBe('shove only with vision')
  })

  it('keeps valid refs (anchor catalog + task:) and silently drops unknown ones', async () => {
    const { cmd } = makeFakes()
    const r = await cmd.execute({
      matchId: MATCH,
      text: 'note',
      refs: [
        { id: 'stat:kda', kind: 'stat', label: 'KDA' },
        { id: `task:${TASK.id}`, kind: 'task', label: TASK.description },
        { id: 'marker:ghost#9', kind: 'marker' }
      ]
    })
    expect(r.refs.map((x) => x.id)).toEqual(['stat:kda', `task:${TASK.id}`])
    expect(r.refs[0].label).toBe('KDA') // labels pass through
  })

  it('rejects empty text', async () => {
    const { cmd } = makeFakes()
    await expect(cmd.execute({ matchId: MATCH, text: '   ', refs: [] })).rejects.toThrow(/needs some text/)
  })

  it('enforces the 20-per-match cap on create', async () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`, matchId: MATCH, text: 't', refs: [], source: 'player' as const, createdAt: 1, updatedAt: 1
    }))
    const { cmd } = makeFakes(existing)
    await expect(cmd.execute({ matchId: MATCH, text: 'one more', refs: [] })).rejects.toThrow(/20 reflections/)
  })

  it('edits preserve author and creation time, bump updatedAt', async () => {
    const coachRow: Reflection = {
      id: 'r1', matchId: MATCH, text: 'old', refs: [], source: 'coach', createdAt: 5, updatedAt: 5
    }
    const { cmd } = makeFakes([coachRow])
    const r = await cmd.execute({ matchId: MATCH, id: 'r1', text: 'edited', refs: [] })
    expect(r.source).toBe('coach')
    expect(r.createdAt).toBe(5)
    expect(r.updatedAt).toBe(NOW)
    expect(r.text).toBe('edited')
  })

  it('refuses edits across matches', async () => {
    const row: Reflection = { id: 'r1', matchId: 'OTHER', text: 'x', refs: [], source: 'player', createdAt: 1, updatedAt: 1 }
    const { cmd } = makeFakes([row])
    await expect(cmd.execute({ matchId: MATCH, id: 'r1', text: 'y', refs: [] })).rejects.toThrow(/not found/)
  })

  it('legacy adoption is idempotent and lands as coach-authored', async () => {
    const { cmd } = makeFakes()
    const first = await cmd.execute({ matchId: MATCH, id: `${MATCH}-refl-legacy`, text: 'migrated', refs: [] })
    expect(first.source).toBe('coach')
    const second = await cmd.execute({ matchId: MATCH, id: `${MATCH}-refl-legacy`, text: 'changed?', refs: [] })
    expect(second.text).toBe('migrated') // no-op: stored row returned
  })
})

describe('DeleteReflection', () => {
  it('deletes own-match rows, no-ops on missing, refuses cross-match', () => {
    const rows = new Map<string, Reflection>([
      ['r1', { id: 'r1', matchId: MATCH, text: 'x', refs: [], source: 'player', createdAt: 1, updatedAt: 1 }],
      ['r2', { id: 'r2', matchId: 'OTHER', text: 'y', refs: [], source: 'player', createdAt: 1, updatedAt: 1 }]
    ])
    const repo = {
      list: vi.fn(), upsert: vi.fn(), countForMatch: vi.fn(),
      get: (id: string) => rows.get(id) ?? null,
      delete: (id: string) => { rows.delete(id) }
    }
    const cmd = new DeleteReflection(repo as never)
    cmd.execute(MATCH, 'r1')
    expect(rows.has('r1')).toBe(false)
    cmd.execute(MATCH, 'missing') // no-op
    expect(() => cmd.execute(MATCH, 'r2')).toThrow(/another match/)
  })
})
