import { describe, it, expect, vi } from 'vitest'
import {
  parseReview, parseFraming, parseNarration, parseTasks, parseReflection,
  buildReflectionPrompt, SUBMIT_REFLECTION,
  parseDiscoveryPlan, buildDiscoveryPrompt, SUBMIT_PLAN,
  parseProposalPayload, renderAgenticContext, buildAgenticPrompt, PROPOSE_TOOLS
} from '../../src/main/adapters/driven/anthropic/matchPrompts'
import type { AgenticChatExtras } from '../../src/main/application/ports/MatchCoachingModel'
import {
  AnthropicMatchCoachingModel,
  type CreateMessage
} from '../../src/main/adapters/driven/anthropic/AnthropicMatchCoachingModel'
import type { ReviewExtras } from '../../src/main/application/ports/MatchCoachingModel'

const validReview = {
  verdict: { lead: 'Even until 24, then you threw it.', gild: 'Two solo river deaths before Baron.' },
  improve: 'Recall on the lead and group by 24:00.',
  claims: [
    { text: 'You were +310 at 14 but −1240 by 24.', ref: { id: 'stat:gold_at_24', kind: 'marker' } },
    { text: 'Two solo deaths gave up the swing.', ref: { id: 'stat:solo_deaths', kind: 'stat' } }
  ],
  cohort: 'vs Ahri mid meta (patch 14.10)',
  benchmarkBasis: 'champion_patch',
  confidence: 'established'
}

function toolMessage(input: unknown): { content: Array<{ type: string; name?: string; input?: unknown }> } {
  return { content: [{ type: 'tool_use', name: 'submit_review', input }] }
}

const extras: ReviewExtras = { framing: '', narration: '', benchmark: null }

describe('parseReview', () => {
  it('accepts a well-formed payload', () => {
    const out = parseReview(validReview)
    expect(out.verdict.lead).toContain('threw it')
    expect(out.improve).toContain('24:00')
    expect(out.claims).toHaveLength(2)
    expect(out.benchmarkBasis).toBe('champion_patch')
  })

  it('throws when the verdict lead is missing', () => {
    expect(() => parseReview({ ...validReview, verdict: { lead: '', gild: 'x' } })).toThrow()
  })

  it('throws when the payload is not an object', () => {
    expect(() => parseReview(null)).toThrow()
  })

  it('drops claims with a malformed or missing ref', () => {
    const out = parseReview({
      ...validReview,
      claims: [
        { text: 'ok', ref: { id: 'stat:cs', kind: 'stat' } },
        { text: 'no ref' },
        { text: 'bad kind', ref: { id: 'x', kind: 'lol' } }
      ]
    })
    expect(out.claims).toHaveLength(1)
  })

  it('defaults an unknown benchmarkBasis to general', () => {
    expect(parseReview({ ...validReview, benchmarkBasis: 'nope' }).benchmarkBasis).toBe('general')
  })
})

describe('parseFraming', () => {
  const valid = {
    headlineTag: 'Baron 24:40', headlineTagIntent: 'objective', quickRead: 'Even until 24.',
    mvp: { champion: 'Zed', isYou: false, teamId: 200, justification: '12/2/8.' }, matchupTips: ['Track ult.']
  }
  it('accepts a well-formed payload', () => {
    const out = parseFraming(valid)
    expect(out.headlineTag).toBe('Baron 24:40')
    expect(out.mvp?.champion).toBe('Zed')
    expect(out.matchupTips).toHaveLength(1)
  })
  it('defaults an unknown intent to neutral and allows null mvp', () => {
    const out = parseFraming({ ...valid, headlineTagIntent: 'nope', mvp: null })
    expect(out.headlineTagIntent).toBe('neutral')
    expect(out.mvp).toBeNull()
  })
  it('throws when required text is missing', () => {
    expect(() => parseFraming({ ...valid, quickRead: '' })).toThrow()
  })
})

describe('parseNarration', () => {
  const valid = {
    highlightNarrations: [{ ref: { id: 'marker:objective#1', kind: 'marker' }, text: 'First drake.' }],
    deathNarrations: [{ ref: { id: 'marker:death#1', kind: 'marker' }, character: 'caught_out', text: 'Alone in river.' }],
    turningPoints: [{ time: '22:10', swing: '−1.6k', dir: 'down', you: { x: 24, y: 30 }, event: { x: 62, y: 60 }, what: 'died', better: 'recall' }]
  }
  it('accepts a well-formed payload', () => {
    const out = parseNarration(valid)
    expect(out.highlightNarrations).toHaveLength(1)
    expect(out.turningPoints[0].dir).toBe('down')
  })
  it('coerces an unknown death character to unclear', () => {
    const out = parseNarration({ ...valid, deathNarrations: [{ ref: { id: 'marker:death#1', kind: 'marker' }, character: 'nope', text: 'x' }] })
    expect(out.deathNarrations[0].character).toBe('unclear')
  })
  it('keeps turning points without positions (defaults to centre) and clamps coords', () => {
    const out = parseNarration({
      ...valid,
      turningPoints: [
        { time: '1:00', swing: 's', dir: 'up', what: 'w', better: 'b' }, // no positions → centred
        { time: '2:00', swing: 's', dir: 'up', you: { x: 999, y: -5 }, event: { x: 10, y: 10 }, what: 'w', better: 'b' },
        { time: '3:00', swing: 's', dir: 'up', you: { x: 10, y: 10 }, event: { x: 10, y: 10 } } // missing what/better → dropped
      ]
    })
    expect(out.turningPoints).toHaveLength(2)
    expect(out.turningPoints[0].you).toEqual({ x: 50, y: 50 })
    expect(out.turningPoints[1].you).toEqual({ x: 100, y: 0 })
  })
})

describe('parseTasks', () => {
  it('keeps computable tasks and drops non-computable metrics', () => {
    const out = parseTasks({
      set: [
        { description: 'Hit 70 CS by 10', metric: 'cs_at_10', comparator: '>=', target: 70, scope: 'role', role: 'Mid' },
        { description: 'bad', metric: 'vibes', comparator: '>=', target: 1, scope: 'universal' }
      ],
      retire: ['old-1']
    })
    expect(out.set).toHaveLength(1)
    expect(out.set[0].metric).toBe('cs_at_10')
    expect(out.retire).toEqual(['old-1'])
  })
  it('drops a scoped task missing its champion/role', () => {
    const out = parseTasks({ set: [{ description: 'x', metric: 'cs_at_10', comparator: '>=', target: 70, scope: 'champion' }], retire: [] })
    expect(out.set).toHaveLength(0)
  })
  it('clamps the set to three', () => {
    const t = { description: 'x', metric: 'deaths', comparator: '<=', target: 4, scope: 'universal' }
    expect(parseTasks({ set: Array(5).fill(t), retire: [] }).set).toHaveLength(3)
  })
})

describe('AnthropicMatchCoachingModel.analyzeReview', () => {
  it('calls the forced tool and returns the parsed review', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue(toolMessage(validReview))
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.analyzeReview('GAME result=loss ...', extras, 'claude-opus-4-8')
    expect(out.claims).toHaveLength(2)
    const params = (create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'submit_review' })
    expect(params.model).toBe('claude-opus-4-8')
  })

  it('rejects when no tool_use block is returned', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue({ content: [{ type: 'text' }] })
    const model = new AnthropicMatchCoachingModel(create)
    await expect(model.analyzeReview('x', extras, 'm')).rejects.toThrow()
  })
})

describe('parseReflection', () => {
  it('returns the reflection text and a clamped, computable task set', () => {
    const out = parseReflection({
      reflection: 'I kept roaming alone with a lead. Next game I recall and group by 24.',
      set: [
        { description: "Don't die alone in the river.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal' },
        { description: 'bad metric', metric: 'not_a_metric', comparator: '>=', target: 1, scope: 'universal' }
      ],
      retire: ['old-1']
    })
    expect(out.reflection).toContain('group by 24')
    expect(out.tasks.set).toHaveLength(1) // the uncomputable metric is dropped
    expect(out.tasks.retire).toEqual(['old-1'])
  })

  it('throws when the reflection text is empty', () => {
    expect(() => parseReflection({ reflection: '   ', set: [], retire: [] })).toThrow()
  })

  it('requires the memory array in the tool schema (empty = nothing durable)', () => {
    expect(SUBMIT_REFLECTION.input_schema.required).toContain('memory')
    const memorySchema = SUBMIT_REFLECTION.input_schema.properties.memory as { items: { properties: { kind: { enum: string[] } } } }
    expect(memorySchema.items.properties.kind.enum).toEqual(
      ['observation', 'pattern', 'strength', 'weakness', 'reflection', 'milestone']
    )
  })

  it('parses valid memory entries and keeps only the well-formed fields', () => {
    const out = parseReflection({
      reflection: 'ok',
      set: [],
      retire: [],
      memory: [
        { kind: 'pattern', phase: 'mid', statement: 'Dies solo in river between 14 and 20 minutes.' },
        { kind: 'strength', champion: 'Ahri', phase: 'nonsense', statement: 'Strong roam timings on Ahri.' }
      ]
    })
    expect(out.memory).toHaveLength(2)
    expect(out.memory[0]).toEqual({ kind: 'pattern', phase: 'mid', statement: 'Dies solo in river between 14 and 20 minutes.' })
    expect(out.memory[1]).toEqual({ kind: 'strength', champion: 'Ahri', statement: 'Strong roam timings on Ahri.' }) // bad phase dropped, entry kept
  })

  it('drops invalid memory entries and tolerates the field missing entirely', () => {
    const out = parseReflection({
      reflection: 'ok',
      set: [],
      retire: [],
      memory: [
        { kind: 'vibes', statement: 'Not a real kind.' },
        { kind: 'pattern', statement: '   ' },
        { kind: 'pattern', statement: 'x'.repeat(241) }, // over the 240-char cap
        'not an object'
      ]
    })
    expect(out.memory).toEqual([])
    // Field missing entirely → empty array, not a throw.
    expect(parseReflection({ reflection: 'ok', set: [], retire: [] }).memory).toEqual([])
  })

  it('caps the memory proposals at three', () => {
    const entry = { kind: 'observation', statement: 'A durable fact.' }
    const out = parseReflection({ reflection: 'ok', set: [], retire: [], memory: Array(5).fill(entry) })
    expect(out.memory).toHaveLength(3)
  })
})

describe('buildReflectionPrompt', () => {
  const baseExtras = { standing: [], catalogMetricKeys: ['deaths' as const], existingMemory: [] }

  it('renders existing memory as compact MEMORY lines in the closing message', () => {
    const { messages } = buildReflectionPrompt('BRIEFING', [], {
      ...baseExtras,
      existingMemory: [
        { kind: 'pattern', champion: 'ahri', occurrences: 3, statement: 'Dies solo in river 14-20min.' },
        { kind: 'strength', role: 'Mid', phase: 'close', metric: 'deaths', occurrences: 1, statement: 'Closes clean.' }
      ]
    })
    const closing = messages.at(-1)?.content ?? ''
    expect(closing).toContain('MEMORY kind=pattern champ=ahri x3 "Dies solo in river 14-20min."')
    expect(closing).toContain('MEMORY kind=strength role=Mid phase=close metric=deaths x1 "Closes clean."')
  })

  it('renders a MEMORY none line when the store is empty', () => {
    const { messages } = buildReflectionPrompt('BRIEFING', [], baseExtras)
    expect(messages.at(-1)?.content).toContain('MEMORY none')
  })
})

describe('parseDiscoveryPlan', () => {
  it('accepts a well-formed payload and keeps the memory query', () => {
    const out = parseDiscoveryPlan({
      requests: [{ kind: 'memory', query: 'river deaths' }, { kind: 'history' }, { kind: 'benchmark' }]
    })
    expect(out.requests).toEqual([
      { kind: 'memory', query: 'river deaths' },
      { kind: 'history' },
      { kind: 'benchmark' }
    ])
  })

  it('drops unknown kinds and malformed entries', () => {
    const out = parseDiscoveryPlan({
      requests: [{ kind: 'wiki' }, 'not an object', null, { query: 'no kind' }, { kind: 'history' }]
    })
    expect(out.requests).toEqual([{ kind: 'history' }])
  })

  it('strips the query from non-memory kinds (only memory takes a hint)', () => {
    const out = parseDiscoveryPlan({ requests: [{ kind: 'history', query: 'x' }, { kind: 'memory', query: '  ' }] })
    expect(out.requests).toEqual([{ kind: 'history' }, { kind: 'memory' }])
  })

  it('dedupes by kind+query', () => {
    const out = parseDiscoveryPlan({
      requests: [
        { kind: 'memory', query: 'a' }, { kind: 'memory', query: 'a' }, { kind: 'memory', query: 'b' },
        { kind: 'history' }, { kind: 'history' }
      ]
    })
    expect(out.requests).toEqual([
      { kind: 'memory', query: 'a' },
      { kind: 'memory', query: 'b' },
      { kind: 'history' }
    ])
  })

  it('caps at five requests and never throws on garbage', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ kind: 'memory', query: `q${i}` }))
    expect(parseDiscoveryPlan({ requests: many }).requests).toHaveLength(5)
    expect(parseDiscoveryPlan(null).requests).toEqual([])
    expect(parseDiscoveryPlan({ requests: 'lol' }).requests).toEqual([])
  })

  it('declares the kind enum and the 5-request ceiling in the tool schema', () => {
    expect(SUBMIT_PLAN.input_schema.required).toEqual(['requests'])
    const requests = SUBMIT_PLAN.input_schema.properties.requests as {
      maxItems: number
      items: { properties: { kind: { enum: string[] } } }
    }
    expect(requests.maxItems).toBe(5)
    expect(requests.items.properties.kind.enum).toEqual(['memory', 'history', 'benchmark'])
  })
})

describe('AnthropicMatchCoachingModel.planDiscovery', () => {
  it('forces the submit_plan tool on a small budget and returns the parsed plan', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'submit_plan', input: { requests: [{ kind: 'history' }] } }]
    })
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.planDiscovery(
      'do I always lose this matchup?',
      'INVENTORY memory=3 history=12 benchmark=available tasks=2',
      'claude-haiku-4-5'
    )
    expect(out.requests).toEqual([{ kind: 'history' }])
    const params = (create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'submit_plan' })
    expect(params.max_tokens).toBe(300)
    expect(params.model).toBe('claude-haiku-4-5')
    expect(params.messages[0].content).toContain('INVENTORY memory=3 history=12 benchmark=available tasks=2')
    expect(params.messages[0].content).toContain('do I always lose this matchup?')
  })

  it('builds the user prompt inventory-first, question after', () => {
    const { user, system } = buildDiscoveryPrompt('was that cs ok?', 'INVENTORY memory=0 history=4 benchmark=off tasks=1')
    expect(user.startsWith('INVENTORY memory=0 history=4 benchmark=off tasks=1')).toBe(true)
    expect(user).toContain('Player question: was that cs ok?')
    expect(system).toContain('data scout')
  })
})

describe('AnthropicMatchCoachingModel.chat', () => {
  it('sends the briefing as the first user turn and returns the text reply', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '  So what were you trying to do there?  ' }] })
    const model = new AnthropicMatchCoachingModel(create)
    const reply = await model.chat('BRIEFING', [{ role: 'assistant', text: 'opener' }, { role: 'user', text: 'I went for a pick' }], 'claude-haiku-4-5')
    expect(reply).toBe('So what were you trying to do there?')
    const params = (create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(params.messages[0]).toEqual({ role: 'user', content: 'BRIEFING' })
    expect(params.messages.at(-1)).toEqual({ role: 'user', content: 'I went for a pick' })
    expect(params.tool_choice).toBeUndefined()
  })

  it('throws on an empty reply', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '' }] })
    const model = new AnthropicMatchCoachingModel(create)
    await expect(model.chat('B', [], 'm')).rejects.toThrow()
  })
})

// ── Spec 005: propose-tool payload validators + agentic prompt ───────────────

describe('parseProposalPayload', () => {
  it('coerces a valid propose_update_tasks payload', () => {
    const raw = parseProposalPayload('propose_update_tasks', {
      set: [{ description: 'Hold 7 cs/min', metric: 'cs_per_min', comparator: '>=', target: 7, scope: 'universal' }],
      retire: ['old-task']
    })
    expect(raw.kind).toBe('update_tasks')
    if (raw.kind === 'update_tasks') {
      expect(raw.set).toHaveLength(1)
      expect(raw.retire).toEqual(['old-task'])
    }
  })

  it('drops non-computable metrics and throws when nothing survives', () => {
    expect(() =>
      parseProposalPayload('propose_update_tasks', {
        set: [{ description: 'x', metric: 'apm', comparator: '>=', target: 1, scope: 'universal' }],
        retire: []
      })
    ).toThrow(/at least one valid task/)
  })

  it('retire-only payloads are valid', () => {
    const raw = parseProposalPayload('propose_update_tasks', { set: [], retire: ['a'] })
    if (raw.kind === 'update_tasks') expect(raw.retire).toEqual(['a'])
  })

  it('coerces create/update/delete reflection payloads', () => {
    const create = parseProposalPayload('propose_create_reflection', { text: ' note ', refIds: ['marker:death#1', 7] })
    expect(create).toEqual({ kind: 'create_reflection', text: 'note', refIds: ['marker:death#1'] })
    const update = parseProposalPayload('propose_update_reflection', { reflectionId: 'r1', text: 'edited' })
    expect(update).toEqual({ kind: 'update_reflection', text: 'edited', refIds: [], reflectionId: 'r1' })
    const del = parseProposalPayload('propose_delete_reflection', { reflectionId: 'r1' })
    expect(del).toEqual({ kind: 'delete_reflection', reflectionId: 'r1' })
  })

  it('throws fixable errors on malformed payloads', () => {
    expect(() => parseProposalPayload('propose_create_reflection', { text: '  ' })).toThrow(/non-empty "text"/)
    expect(() => parseProposalPayload('propose_update_reflection', { text: 'x' })).toThrow(/reflectionId/)
    expect(() => parseProposalPayload('propose_delete_reflection', {})).toThrow(/reflectionId/)
    expect(() => parseProposalPayload('made_up_tool', {})).toThrow(/Unknown proposal tool/)
  })
})

describe('chatAgentic tool loop', () => {
  const extras: AgenticChatExtras = {
    standing: [],
    catalogMetricKeys: ['cs_per_min'],
    reflections: [],
    hasPendingProposal: false
  }
  const VALID_TASKS_INPUT = {
    set: [{ description: 'Hold 7 cs/min', metric: 'cs_per_min', comparator: '>=', target: 7, scope: 'universal' }],
    retire: []
  }
  const text = (t: string): { type: string; text: string } => ({ type: 'text', text: t })
  const toolUse = (name: string, input: unknown, id = 'tu1'): { type: string; id: string; name: string; input: unknown } =>
    ({ type: 'tool_use', id, name, input })

  it('plain reply: no tools called, one round', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue({ content: [text('Just talking.')] })
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.chatAgentic('B', [], extras, 'm')
    expect(out).toEqual({ reply: 'Just talking.' })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('captures one valid proposal and continues to text', async () => {
    const create: CreateMessage = vi.fn()
      .mockResolvedValueOnce({ content: [text('Drafting that.'), toolUse('propose_update_tasks', VALID_TASKS_INPUT)] })
      .mockResolvedValueOnce({ content: [text('Take a look at the card.')] })
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.chatAgentic('B', [], extras, 'm')
    expect(out.rawProposal?.kind).toBe('update_tasks')
    expect(out.reply).toContain('Take a look')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('last valid proposal wins across rounds', async () => {
    const second = { set: [{ description: 'Vision 30', metric: 'vision_score', comparator: '>=', target: 30, scope: 'universal' }], retire: [] }
    const create: CreateMessage = vi.fn()
      .mockResolvedValueOnce({ content: [toolUse('propose_update_tasks', VALID_TASKS_INPUT, 'a')] })
      .mockResolvedValueOnce({ content: [toolUse('propose_update_tasks', second, 'b')] })
      .mockResolvedValueOnce({ content: [text('Done.')] })
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.chatAgentic('B', [], extras, 'm')
    if (out.rawProposal?.kind === 'update_tasks') {
      expect(out.rawProposal.set[0].metric).toBe('vision_score')
    } else {
      throw new Error('expected a task proposal')
    }
  })

  it('caps tool rounds at 3 then forces a text-only closer', async () => {
    const create = vi.fn(async (params: Record<string, unknown>) => {
      // keep tool-calling whenever tools are offered
      if (params.tools) return { content: [toolUse('propose_update_tasks', VALID_TASKS_INPUT)] }
      return { content: [text('Forced closer.')] }
    }) as unknown as CreateMessage
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.chatAgentic('B', [], extras, 'm')
    expect(out.reply).toBe('Forced closer.')
    expect(create).toHaveBeenCalledTimes(4) // 3 tool rounds + forced text
    const lastCall = (create as unknown as ReturnType<typeof vi.fn>).mock.calls[3][0] as Record<string, unknown>
    expect(lastCall.tools).toBeUndefined()
  })

  it('feeds malformed payloads back as errors; no proposal escapes', async () => {
    const create: CreateMessage = vi.fn()
      .mockResolvedValueOnce({ content: [toolUse('propose_create_reflection', { text: '  ' })] })
      .mockResolvedValueOnce({ content: [text('Could not draft it, but here is the advice.')] })
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.chatAgentic('B', [], extras, 'm')
    expect(out.rawProposal).toBeUndefined()
    expect(out.reply).toContain('advice')
    const secondCall = (create as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0] as { messages: { content: unknown }[] }
    const lastMsg = secondCall.messages[secondCall.messages.length - 1].content as { is_error?: boolean }[]
    expect(lastMsg[0].is_error).toBe(true)
  })

  it('refuses new proposals while one is pending', async () => {
    const create: CreateMessage = vi.fn()
      .mockResolvedValueOnce({ content: [toolUse('propose_update_tasks', VALID_TASKS_INPUT)] })
      .mockResolvedValueOnce({ content: [text('Settle the open card first.')] })
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.chatAgentic('B', [], { ...extras, hasPendingProposal: true }, 'm')
    expect(out.rawProposal).toBeUndefined()
    expect(out.reply).toContain('Settle')
  })

  it('mid-loop failure degrades to the text already produced', async () => {
    const create: CreateMessage = vi.fn()
      .mockResolvedValueOnce({ content: [text('First thought.'), toolUse('propose_update_tasks', VALID_TASKS_INPUT)] })
      .mockRejectedValueOnce(new Error('network'))
    const model = new AnthropicMatchCoachingModel(create)
    const out = await model.chatAgentic('B', [], extras, 'm')
    expect(out.reply).toBe('First thought.')
    expect(out.rawProposal?.kind).toBe('update_tasks')
  })

  it('failure before any content propagates', async () => {
    const create: CreateMessage = vi.fn().mockRejectedValue(new Error('network'))
    const model = new AnthropicMatchCoachingModel(create)
    await expect(model.chatAgentic('B', [], extras, 'm')).rejects.toThrow('network')
  })
})

describe('buildAgenticPrompt', () => {
  const agentic: AgenticChatExtras = {
    standing: [{
      id: 't1', description: 'Vision 25+', metric: 'vision_score', comparator: '>=', target: 25,
      scope: 'universal', status: 'active', sourceMatchId: 'M1'
    }],
    catalogMetricKeys: ['cs_per_min', 'vision_score'],
    reflections: [{ id: 'r1', source: 'player', text: 'shove only with vision' }],
    hasPendingProposal: false
  }

  it('renders task ids, metric keys and reflection ids into the context', () => {
    const ctx = renderAgenticContext(agentic)
    expect(ctx).toContain('TASK [t1]')
    expect(ctx).toContain('cs_per_min, vision_score')
    expect(ctx).toContain('REFL [r1] (player)')
  })

  it('flags a pending proposal so the model will not stack another', () => {
    const ctx = renderAgenticContext({ ...agentic, hasPendingProposal: true })
    expect(ctx).toContain('already awaiting')
  })

  it('briefing rides first, history after; four propose tools are exported', () => {
    const { messages } = buildAgenticPrompt('BRIEF', [{ role: 'user', text: 'hi' }], agentic)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('BRIEF')
    expect(messages[0].content).toContain('TASK [t1]')
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' })
    expect(PROPOSE_TOOLS.map((t) => t.name)).toEqual([
      'propose_update_tasks', 'propose_create_reflection', 'propose_update_reflection', 'propose_delete_reflection'
    ])
  })
})
