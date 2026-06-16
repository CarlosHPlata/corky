import { describe, it, expect, vi } from 'vitest'
import { CoachChat } from '../../src/main/application/commands/CoachChat'
import { MatchService } from '../../src/main/application/services/Match/MatchService'
import type { MatchCoachingModel, DiscoveryPlan } from '../../src/main/application/ports/MatchCoachingModel'
import type { GetHistoryAggregates } from '../../src/main/application/queries/GetHistoryAggregates'
import type { ChatTurn } from '../../src/shared/types'
import type { CoachingConfigOverrides } from '../../src/shared/config'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

function fakeModel(reply: string, plan: DiscoveryPlan | Error = { requests: [] }) {
  // The command speaks chatAgentic since spec 005 — plain replies, no proposal.
  const chat = vi.fn().mockResolvedValue({ reply })
  const planDiscovery =
    plan instanceof Error ? vi.fn().mockRejectedValue(plan) : vi.fn().mockResolvedValue(plan)
  const model = {
    analyzeFraming: vi.fn(), analyzeNarration: vi.fn(), analyzeReview: vi.fn(), analyzeTasks: vi.fn(),
    chat: vi.fn(),
    chatAgentic: chat,
    planDiscovery,
    summarizeReflection: vi.fn()
  } as unknown as MatchCoachingModel
  return { model, chat, planDiscovery }
}

const MEMORY_ROW = {
  id: 'm1', kind: 'pattern', champion: 'ahri', statement: 'Dies solo in river 14-20min.',
  evidenceMatchIds: ['OLD_1'], occurrences: 3, firstSeen: 1, lastSeen: 2, status: 'active'
}

const HISTORY_AGG = {
  basis: 'champion', preferredWins: true, games: 7, wins: 5, winRate: 0.71,
  averages: { cs_at_10: 78.5 }
}

const BENCHMARK_REF = { basis: 'champion_patch', csPerMin: 6.8, deathsCeiling: 5, patch: '14.10' }

function deps(
  model: MatchCoachingModel,
  opts: { overrides?: CoachingConfigOverrides } = {}
) {
  const matchRepo = {
    getCurrentAccount: () => ({ puuid: PLAYER_PUUID, gameName: 'P', tagLine: 'EUW', platform: 'euw1', region: 'europe' }),
    getMatchDetail: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadMatch('WIN_001')) }),
    getTimeline: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadTimeline('WIN_001')) }),
    countMatches: () => 12
  } as never
  const reportRepo = { getMatchAnalysis: () => null, getStandingTasks: () => [] } as never
  const goalRepo = { get: () => null } as never
  const semanticMemory = { upsert: vi.fn(), query: () => [MEMORY_ROW], setStatus: vi.fn() } as never
  const getHistoryAggregates = { execute: () => HISTORY_AGG } as unknown as GetHistoryAggregates
  const benchmarkSource = { getChampionBenchmark: vi.fn().mockResolvedValue(BENCHMARK_REF) } as never
  const insightsSource = {
    getChampionBuild: vi.fn().mockResolvedValue(null),
    getLaneMatchup: vi.fn().mockResolvedValue(null)
  } as never
  const coachingConfigRepo = { get: () => opts.overrides ?? null, save: vi.fn(), clear: vi.fn() } as never
  const reflectionRepo = {
    list: () => [], get: () => null, upsert: vi.fn(), delete: vi.fn(), countForMatch: () => 0
  } as never
  const itemCatalog = { getItemNames: vi.fn().mockResolvedValue(new Map()) } as never
  const matchService = new MatchService(matchRepo, reportRepo, goalRepo, reflectionRepo, itemCatalog)
  return new CoachChat(
    matchService,
    semanticMemory, getHistoryAggregates, benchmarkSource, insightsSource, coachingConfigRepo,
    model, 'haiku'
  )
}

const SESSION = 'WIN_001-sess-test'

describe('CoachChat', () => {
  it('grounds a turn with refs: REF lines prepended, blank line, then the original text', async () => {
    const { model, chat } = fakeModel('You were behind there.')
    const cmd = deps(model)
    await cmd.execute('WIN_001', SESSION, [
      {
        role: 'user',
        text: 'why is my kda fine but we lost lane?',
        refs: [{ id: 'stat:kda', kind: 'stat' }, { id: 'marker:death#99', kind: 'marker' }]
      }
    ])

    expect(chat).toHaveBeenCalledTimes(1)
    const sent = chat.mock.calls[0][1] as ChatTurn[]
    expect(sent[0].text).toMatch(
      /^REF stat:kda=[\d.]+ \(KDA ratio\)\nREF marker:death#99 \(not found in this match\)\n\nwhy is my kda fine but we lost lane\?$/
    )
  })

  it('passes turns without refs through untouched and does not mutate the input', async () => {
    const { model, chat } = fakeModel('Good question.')
    const cmd = deps(model)
    const messages: ChatTurn[] = [
      { role: 'user', text: 'what should I have done at 14?' },
      { role: 'assistant', text: 'Walk me through your recall timing.' },
      { role: 'user', text: 'why this number?', refs: [{ id: 'stat:cs', kind: 'stat' }] }
    ]
    await cmd.execute('WIN_001', SESSION, messages)

    const sent = chat.mock.calls[0][1] as ChatTurn[]
    expect(sent[0]).toBe(messages[0]) // ref-less turns pass through as-is
    expect(sent[1]).toBe(messages[1])
    expect(sent[2].text).toMatch(/^REF stat:cs=\d+ \(CS\)\n\nwhy this number\?$/)
    expect(messages[2].text).toBe('why this number?') // input transcript untouched
  })

  it('returns the model reply intact', async () => {
    const { model } = fakeModel('Look at the map before you push.')
    const cmd = deps(model)
    const out = await cmd.execute('WIN_001', SESSION, [{ role: 'user', text: 'hi' }])
    expect(out).toEqual({ reply: 'Look at the map before you push.' })
  })

  it('appends no dossier when the planner requests nothing', async () => {
    const { model, chat, planDiscovery } = fakeModel('ok', { requests: [] })
    await deps(model).execute('WIN_001', SESSION, [{ role: 'user', text: 'was my cs fine?' }])

    expect(planDiscovery).toHaveBeenCalledTimes(1)
    // Question = the latest user turn; inventory = the cheap local counts.
    expect(planDiscovery.mock.calls[0][0]).toBe('was my cs fine?')
    expect(planDiscovery.mock.calls[0][1]).toMatch(/^INVENTORY memory=1 history=12 benchmark=available champion_build=available lane_matchup=\S+ tasks=0$/)
    expect(planDiscovery.mock.calls[0][2]).toBe('haiku')
    const briefing = chat.mock.calls[0][0] as string
    expect(briefing).not.toContain('DOSSIER')
  })

  it('honors memory+history+benchmark requests and appends their dossier lines', async () => {
    const { model, chat } = fakeModel('ok', {
      requests: [{ kind: 'memory', query: 'river deaths' }, { kind: 'history' }, { kind: 'benchmark' }]
    })
    await deps(model).execute('WIN_001', SESSION, [{ role: 'user', text: 'do I always die in river?' }])

    const briefing = chat.mock.calls[0][0] as string
    expect(briefing).toContain('\n\nDOSSIER (fetched for this question)\n')
    expect(briefing).toContain('MEM kind=pattern champ=ahri x3 "Dies solo in river 14-20min."')
    expect(briefing).toMatch(/HIST basis=champion champ=\S+ wins_only=true games=7 wr=71% cs_at_10=78\.5/)
    expect(briefing).toContain('BENCH cs_per_min basis=champion_patch ref=6.8 patch=14.10')
  })

  it('ignores a memory request when the local-som source is disabled', async () => {
    const { model, chat } = fakeModel('ok', {
      requests: [{ kind: 'memory', query: 'river' }, { kind: 'history' }]
    })
    const cmd = deps(model, { overrides: { version: 1, sources: { 'local-som': false } } })
    await cmd.execute('WIN_001', SESSION, [{ role: 'user', text: 'do I always die in river?' }])

    const briefing = chat.mock.calls[0][0] as string
    expect(briefing).toContain('DOSSIER')
    expect(briefing).toContain('HIST basis=champion')
    expect(briefing).not.toContain('MEM ')
  })

  it('honors at most 3 requests on the standard tier', async () => {
    const { model, chat } = fakeModel('ok', {
      requests: [
        { kind: 'memory', query: 'a' }, { kind: 'memory', query: 'b' }, { kind: 'memory', query: 'c' },
        { kind: 'history' }, { kind: 'benchmark' }
      ]
    })
    await deps(model).execute('WIN_001', SESSION, [{ role: 'user', text: 'q' }])

    const briefing = chat.mock.calls[0][0] as string
    expect(briefing).toContain('MEM ')
    expect(briefing).not.toContain('HIST ')
    expect(briefing).not.toContain('BENCH ')
  })

  it('skips discovery entirely on the eco tier', async () => {
    const { model, chat, planDiscovery } = fakeModel('ok', { requests: [{ kind: 'history' }] })
    const cmd = deps(model, { overrides: { version: 1, budgetTier: 'eco' } })
    const out = await cmd.execute('WIN_001', SESSION, [{ role: 'user', text: 'q' }])

    expect(planDiscovery).not.toHaveBeenCalled()
    expect(chat.mock.calls[0][0] as string).not.toContain('DOSSIER')
    expect(out).toEqual({ reply: 'ok' })
  })

  it('still answers when the planner throws — no dossier, chat untouched', async () => {
    const { model, chat } = fakeModel('still here', new Error('planner down'))
    const out = await deps(model).execute('WIN_001', SESSION, [{ role: 'user', text: 'q' }])

    expect(out).toEqual({ reply: 'still here' })
    expect(chat.mock.calls[0][0] as string).not.toContain('DOSSIER')
  })

  it('reports its discovery plan and every fetch result on the event bus', async () => {
    const { eventBus } = await import('../../src/main/application/events/EventBus')
    const events: { type: string; [k: string]: unknown }[] = []
    const collect = (e: object): void => void events.push(e as { type: string })
    eventBus.on('telemetry.discovery.plan', collect)
    eventBus.on('telemetry.discovery.fetch', collect)
    try {
      const { model } = fakeModel('ok', {
        requests: [{ kind: 'memory', query: 'river deaths' }, { kind: 'benchmark' }]
      })
      await deps(model).execute('WIN_001', SESSION, [{ role: 'user', text: 'do I always die in river?' }])
    } finally {
      eventBus.off('telemetry.discovery.plan', collect)
      eventBus.off('telemetry.discovery.fetch', collect)
    }

    const plan = events.find((e) => e.type === 'telemetry.discovery.plan')
    expect(plan).toMatchObject({
      question: 'do I always die in river?',
      requests: [{ kind: 'memory', query: 'river deaths' }, { kind: 'benchmark' }]
    })
    const fetches = events.filter((e) => e.type === 'telemetry.discovery.fetch')
    expect(fetches).toHaveLength(2)
    expect(fetches[0]).toMatchObject({ kind: 'memory', source: 'local-som', ok: true })
    expect((fetches[0] as unknown as { lines: string[] }).lines[0]).toContain('MEM kind=pattern')
    expect(fetches[1]).toMatchObject({ kind: 'benchmark', source: 'opgg-mcp', ok: true })
  })
})
