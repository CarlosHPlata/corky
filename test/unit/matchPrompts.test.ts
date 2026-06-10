import { describe, it, expect, vi } from 'vitest'
import { parseReview, parseFraming, parseNarration, parseTasks, parseReflection } from '../../src/main/adapters/driven/anthropic/matchPrompts'
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
