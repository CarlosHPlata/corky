import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResolveProposal } from '../../src/main/application/commands/ResolveProposal'
import { standingBaseline } from '../../src/main/domain/chat/proposal'
import type {
  ActionProposal, ChatSession, ChatTurn, ProposalResolution, Reflection, StandingFocusTask
} from '../../src/shared/types'

const MATCH = 'EUW1_1'
const SESS = `${MATCH}-sess-a`
const PROP = `${SESS}-prop-1`
const NOW = 1_749_550_000_000

const TASK_A: StandingFocusTask = {
  id: 'a', description: 'Hold 6.5 cs/min', metric: 'cs_per_min', comparator: '>=', target: 6.5,
  scope: 'universal', status: 'active', sourceMatchId: MATCH
}
const TASK_B: StandingFocusTask = {
  id: 'b', description: 'Vision 25+', metric: 'vision_score', comparator: '>=', target: 25,
  scope: 'universal', status: 'active', sourceMatchId: MATCH
}

// ---- fakes -----------------------------------------------------------------

function makeFakes(proposal: ActionProposal, standing: StandingFocusTask[] = [TASK_A, TASK_B]) {
  const turns: ChatTurn[] = [{ role: 'assistant', text: 'card', proposal: { ...proposal } }]
  const session: ChatSession = { id: SESS, matchId: MATCH, title: 'T', createdAt: 1, updatedAt: 1, turns }

  const sessions = {
    listMetas: vi.fn(),
    get: vi.fn(() => session),
    upsert: vi.fn(),
    resolveProposal: vi.fn((_s: string, _p: string, r: Exclude<ProposalResolution, 'pending'>) => {
      const t = turns[0].proposal!
      if (t.resolution !== 'pending') return t.resolution
      t.resolution = r
      return r
    }),
    revertToPending: vi.fn(() => { turns[0].proposal!.resolution = 'pending' })
  }

  const reflectionRows = new Map<string, Reflection>()
  const reflections = {
    list: vi.fn(() => [...reflectionRows.values()]),
    get: vi.fn((id: string) => reflectionRows.get(id) ?? null),
    upsert: vi.fn((r: Reflection) => { reflectionRows.set(r.id, r) }),
    delete: vi.fn((id: string) => { reflectionRows.delete(id) }),
    countForMatch: vi.fn(() => reflectionRows.size)
  }

  let standingNow = [...standing]
  const reportRepo = {
    getStandingTasks: vi.fn(() => standingNow),
    retireStandingTasks: vi.fn((ids: string[]) => {
      standingNow = standingNow.map((t) => (ids.includes(t.id) ? { ...t, status: 'retired' as const } : t))
    }),
    saveStandingTasks: vi.fn((_p: string, tasks: StandingFocusTask[]) => {
      const byId = new Map(standingNow.map((t) => [t.id, t]))
      for (const t of tasks) byId.set(t.id, t)
      standingNow = [...byId.values()]
    }),
    getMatchAnalysis: vi.fn(() => null),
    upsertMatchAnalysis: vi.fn()
  }

  const matchRepo = { getCurrentAccount: vi.fn(() => ({ puuid: 'P1' })) }

  const onDistill = vi.fn()
  const cmd = new ResolveProposal(
    matchRepo as never,
    reportRepo as never,
    sessions as never,
    reflections as never,
    () => NOW,
    onDistill
  )
  return { cmd, sessions, reflections, reportRepo, reflectionRows, onDistill, getStanding: () => standingNow }
}

function taskProposal(standing: StandingFocusTask[] = [TASK_A, TASK_B]): ActionProposal {
  return {
    id: PROP,
    resolution: 'pending',
    payload: {
      kind: 'update_tasks',
      set: [{ ...TASK_A, target: 7, description: 'Hold 7 cs/min' }, TASK_B],
      retireIds: [],
      baseline: standingBaseline(standing)
    }
  }
}

// ---- tests -------------------------------------------------------------------

describe('ResolveProposal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts a task proposal: retires, saves, resolves once', () => {
    const { cmd, getStanding, sessions } = makeFakes(taskProposal())
    const out = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    expect(out.resolution).toBe('accepted')
    expect(getStanding().find((t) => t.id === 'a')?.target).toBe(7)
    expect(sessions.resolveProposal).toHaveBeenCalledWith(SESS, PROP, 'accepted', NOW)
  })

  it('honors explicit retires on accept', () => {
    const p = taskProposal()
    if (p.payload.kind === 'update_tasks') {
      p.payload.set = [{ ...TASK_A, target: 7 }]
      p.payload.retireIds = ['b']
    }
    const { cmd, getStanding } = makeFakes(p)
    cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    expect(getStanding().find((t) => t.id === 'b')?.status).toBe('retired')
  })

  it('reject applies nothing', () => {
    const { cmd, getStanding, reportRepo } = makeFakes(taskProposal())
    const out = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'reject' })
    expect(out.resolution).toBe('rejected')
    expect(reportRepo.saveStandingTasks).not.toHaveBeenCalled()
    expect(getStanding().find((t) => t.id === 'a')?.target).toBe(6.5)
  })

  it('a stale baseline accepts as stale and applies nothing', () => {
    // proposal minted against a DIFFERENT (older) standing set
    const oldStanding = [TASK_A]
    const { cmd, reportRepo } = makeFakes(taskProposal(oldStanding))
    const out = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    expect(out.resolution).toBe('stale')
    expect(reportRepo.saveStandingTasks).not.toHaveBeenCalled()
  })

  it('double accept: second call returns the recorded outcome, single application', () => {
    const { cmd, reportRepo } = makeFakes(taskProposal())
    const first = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    const second = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    expect(first.resolution).toBe('accepted')
    expect(second.resolution).toBe('accepted')
    expect(reportRepo.saveStandingTasks).toHaveBeenCalledTimes(1)
  })

  it('apply failure reverts the resolution to pending and rethrows', () => {
    const { cmd, sessions, reportRepo } = makeFakes(taskProposal())
    reportRepo.saveStandingTasks.mockImplementation(() => { throw new Error('disk full') })
    expect(() =>
      cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    ).toThrow('disk full')
    expect(sessions.revertToPending).toHaveBeenCalledWith(SESS, PROP)
  })

  it('accepting a coach reflection stores it and fires the distillation hook', () => {
    const proposal: ActionProposal = {
      id: PROP,
      resolution: 'pending',
      payload: { kind: 'create_reflection', text: 'shove only with vision', refs: [] }
    }
    const { cmd, reflectionRows, onDistill } = makeFakes(proposal)
    const out = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    expect(out.reflection?.source).toBe('coach')
    expect(reflectionRows.size).toBe(1)
    expect(onDistill).toHaveBeenCalledWith(MATCH, SESS)
  })

  it('a throwing distillation hook never fails the accept', () => {
    const proposal: ActionProposal = {
      id: PROP,
      resolution: 'pending',
      payload: { kind: 'create_reflection', text: 'note', refs: [] }
    }
    const { cmd, onDistill } = makeFakes(proposal)
    onDistill.mockImplementation(() => { throw new Error('model down') })
    const out = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    expect(out.resolution).toBe('accepted')
  })

  it('update_reflection goes stale when the target was edited since mint', () => {
    const proposal: ActionProposal = {
      id: PROP,
      resolution: 'pending',
      payload: { kind: 'update_reflection', reflectionId: 'r1', text: 'new', refs: [], baseline: 100 }
    }
    const { cmd, reflectionRows } = makeFakes(proposal)
    reflectionRows.set('r1', {
      id: 'r1', matchId: MATCH, text: 'old', refs: [], source: 'player', createdAt: 1, updatedAt: 200
    })
    const out = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    expect(out.resolution).toBe('stale')
    expect(reflectionRows.get('r1')?.text).toBe('old')
  })

  it('delete_reflection accept removes the row', () => {
    const proposal: ActionProposal = {
      id: PROP,
      resolution: 'pending',
      payload: { kind: 'delete_reflection', reflectionId: 'r1', baseline: 100 }
    }
    const { cmd, reflectionRows } = makeFakes(proposal)
    reflectionRows.set('r1', {
      id: 'r1', matchId: MATCH, text: 'old', refs: [], source: 'player', createdAt: 1, updatedAt: 100
    })
    const out = cmd.execute({ matchId: MATCH, sessionId: SESS, proposalId: PROP, decision: 'accept' })
    expect(out.resolution).toBe('accepted')
    expect(reflectionRows.size).toBe(0)
  })
})
