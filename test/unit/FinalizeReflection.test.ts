import { describe, it, expect, vi } from 'vitest'
import { FinalizeReflection } from '../../src/main/application/commands/FinalizeReflection'
import type { MatchCoachingModel, ReflectionProposal } from '../../src/main/application/ports/MatchCoachingModel'
import type { SemanticMemory } from '../../src/main/application/ports/SemanticMemory'
import type { SemanticObject } from '../../src/main/domain/memory/semanticObject'
import type { MatchAnalysis, StandingFocusTask } from '../../src/shared/types'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const baseAnalysis: MatchAnalysis = {
  matchId: 'WIN_001', result: 'win',
  framing: null, narration: null,
  review: { verdict: { lead: 'Clean snowball.', gild: '' }, improve: 'Keep it up.', claims: [], cohort: 'vs general benchmark', benchmarkBasis: 'general', confidence: 'established' },
  tasks: { standing: [], sinceLast: [], firstTime: true },
  status: 'done', sections: { framing: 'skipped', narration: 'skipped', review: 'done', tasks: 'done' },
  lightModel: 'l', heavyModel: 'h', generatedAt: 1
}

function fakeModel(proposal: ReflectionProposal): MatchCoachingModel {
  return {
    analyzeFraming: vi.fn(), analyzeNarration: vi.fn(), analyzeReview: vi.fn(), analyzeTasks: vi.fn(),
    chat: vi.fn(),
    summarizeReflection: vi.fn().mockResolvedValue(proposal)
  } as unknown as MatchCoachingModel
}

function deps(
  model: MatchCoachingModel,
  standing: StandingFocusTask[],
  stored: MatchAnalysis | null,
  storedMemory: SemanticObject[] = []
) {
  const saved: StandingFocusTask[][] = []
  const retired: string[][] = []
  const upserts: MatchAnalysis[] = []
  const memUpserts: { puuid: string; objects: SemanticObject[] }[] = []
  const matchRepo = {
    getCurrentAccount: () => ({ puuid: PLAYER_PUUID, gameName: 'P', tagLine: 'EUW', platform: 'euw1', region: 'europe' }),
    getMatchDetail: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadMatch('WIN_001')) }),
    getTimeline: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadTimeline('WIN_001')) })
  } as never
  const reportRepo = {
    getMatchAnalysis: () => stored,
    upsertMatchAnalysis: (a: MatchAnalysis) => upserts.push(a),
    getStandingTasks: () => standing,
    saveStandingTasks: (_p: string, t: StandingFocusTask[]) => saved.push(t),
    retireStandingTasks: (ids: string[]) => retired.push(ids)
  } as never
  const goalRepo = { get: () => null } as never
  const semanticMemory: SemanticMemory = {
    upsert: (puuid, objects) => memUpserts.push({ puuid, objects }),
    query: () => storedMemory,
    setStatus: () => {}
  }
  const cmd = new FinalizeReflection(matchRepo, reportRepo, goalRepo, semanticMemory, model, 'haiku', () => 999)
  return { cmd, saved, retired, upserts, memUpserts }
}

const existingPattern: SemanticObject = {
  id: 'OLD_01-mem-0', kind: 'pattern', phase: 'mid', statement: 'Dies solo in river between 14 and 20 minutes.',
  evidenceMatchIds: ['OLD_01'], occurrences: 3, firstSeen: 1, lastSeen: 2, status: 'active'
}

describe('FinalizeReflection', () => {
  it('writes the reflection and adds a new focus task off the conversation', async () => {
    const proposal: ReflectionProposal = {
      reflection: 'I overstayed with a lead. Next game I recall earlier.',
      tasks: { set: [{ description: "Don't die alone.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal' }], retire: [] },
      memory: []
    }
    const { cmd, saved, upserts } = deps(fakeModel(proposal), [], baseAnalysis)
    const out = await cmd.execute('WIN_001', [{ role: 'user', text: 'I overstayed' }])

    expect(out.reflection).toContain('recall earlier')
    expect(out.tasksUpdated).toBe(true)
    expect(saved[0]).toHaveLength(1)
    expect(saved[0][0].metric).toBe('solo_deaths')
    // The stored read is patched so the report re-renders its focus section.
    expect(out.analysis?.tasks?.standing).toHaveLength(1)
    expect(upserts).toHaveLength(1)
  })

  it('does NOT wipe the standing tasks when the model returns an empty set', async () => {
    const standing: StandingFocusTask[] = [
      { id: 't1', description: "Don't die alone.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal', status: 'active', sourceMatchId: 'X' },
      { id: 't2', description: 'Hit 70 CS by 10.', metric: 'cs_at_10', comparator: '>=', target: 70, scope: 'role', role: 'Mid', status: 'active', sourceMatchId: 'X' }
    ]
    const proposal: ReflectionProposal = {
      reflection: 'Solid game, nothing to change.',
      tasks: { set: [], retire: [] }, // light model often omits the existing tasks
      memory: []
    }
    const { cmd, saved, upserts } = deps(fakeModel(proposal), standing, baseAnalysis)
    const out = await cmd.execute('WIN_001', [{ role: 'user', text: 'good game' }])

    expect(out.tasksUpdated).toBe(false)
    expect(out.analysis).toBeNull()
    expect(saved).toHaveLength(0) // standing set preserved, nothing re-saved/wiped
    expect(upserts).toHaveLength(0)
  })

  it('retires a task by id without dropping the rest', async () => {
    const standing: StandingFocusTask[] = [
      { id: 't1', description: "Don't die alone.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal', status: 'active', sourceMatchId: 'X' },
      { id: 't2', description: 'Hit 70 CS by 10.', metric: 'cs_at_10', comparator: '>=', target: 70, scope: 'role', role: 'Mid', status: 'active', sourceMatchId: 'X' }
    ]
    const proposal: ReflectionProposal = {
      reflection: 'CS felt fine this game; I want to focus on staying alive.',
      tasks: { set: [], retire: ['t2'] },
      memory: []
    }
    const { cmd, saved } = deps(fakeModel(proposal), standing, baseAnalysis)
    const out = await cmd.execute('WIN_001', [{ role: 'user', text: 'retire cs' }])

    expect(out.tasksUpdated).toBe(true)
    expect(saved[0].map((t) => t.id)).toEqual(['t1']) // t2 retired, t1 kept
  })

  it('merges proposed memory into the store: new subject minted, known subject refreshed', async () => {
    const proposal: ReflectionProposal = {
      reflection: 'I keep dying in river. I also closed well today.',
      tasks: { set: [], retire: [] },
      memory: [
        // Same subject as the stored pattern (kind+phase match, no champ/role/metric).
        { kind: 'pattern', phase: 'mid', statement: 'Still dies solo in river between 14 and 20 minutes.' },
        // Genuinely new subject.
        { kind: 'strength', phase: 'close', statement: 'Closes won games cleanly once ahead at 25 minutes.' }
      ]
    }
    const { cmd, memUpserts } = deps(fakeModel(proposal), [], baseAnalysis, [existingPattern])
    await cmd.execute('WIN_001', [{ role: 'user', text: 'river again' }])

    expect(memUpserts).toHaveLength(1)
    expect(memUpserts[0].puuid).toBe(PLAYER_PUUID)
    const rows = memUpserts[0].objects
    expect(rows).toHaveLength(2)
    const refreshed = rows.find((r) => r.id === 'OLD_01-mem-0')
    expect(refreshed?.occurrences).toBe(4) // 3 + this session
    expect(refreshed?.statement).toContain('Still dies solo')
    expect(refreshed?.evidenceMatchIds).toEqual(['OLD_01', 'WIN_001'])
    const minted = rows.find((r) => r.kind === 'strength')
    expect(minted?.id).toMatch(/^WIN_001-mem-/) // minted from the source match (time-tagged, collision-proof)
    expect(minted?.occurrences).toBe(1)
    expect(minted?.status).toBe('active')
  })

  it('does not touch the memory store when the proposal is empty', async () => {
    const proposal: ReflectionProposal = {
      reflection: 'Nothing new today.',
      tasks: { set: [], retire: [] },
      memory: []
    }
    const { cmd, memUpserts } = deps(fakeModel(proposal), [], baseAnalysis, [existingPattern])
    await cmd.execute('WIN_001', [{ role: 'user', text: 'gg' }])

    expect(memUpserts).toHaveLength(0)
  })

  it('drops invalid memory proposals instead of upserting them', async () => {
    const proposal: ReflectionProposal = {
      reflection: 'Bad memory payloads should not stick.',
      tasks: { set: [], retire: [] },
      memory: [
        { kind: 'vibes' as never, statement: 'Not a real kind.' },
        { kind: 'pattern', statement: '   ' } // blank statement
      ]
    }
    const { cmd, memUpserts } = deps(fakeModel(proposal), [], baseAnalysis)
    await cmd.execute('WIN_001', [{ role: 'user', text: 'x' }])

    expect(memUpserts).toHaveLength(0)
  })

  it('passes the current memory store to the model as a compact projection', async () => {
    const proposal: ReflectionProposal = { reflection: 'ok', tasks: { set: [], retire: [] }, memory: [] }
    const model = fakeModel(proposal)
    const { cmd } = deps(model, [], baseAnalysis, [existingPattern])
    await cmd.execute('WIN_001', [{ role: 'user', text: 'x' }])

    const extras = (model.summarizeReflection as ReturnType<typeof vi.fn>).mock.calls[0][2]
    expect(extras.existingMemory).toEqual([
      { kind: 'pattern', phase: 'mid', statement: 'Dies solo in river between 14 and 20 minutes.', occurrences: 3 }
    ])
  })
})
