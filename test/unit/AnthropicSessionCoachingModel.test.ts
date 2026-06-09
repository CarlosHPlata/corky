import { describe, it, expect, vi } from 'vitest'
import {
  AnthropicSessionCoachingModel,
  parseSessionAnalysis,
  type CreateMessage
} from '../../src/main/adapters/driven/anthropic/AnthropicSessionCoachingModel'
import { computeSessionFeatures } from '../../src/main/domain/sessionFeatures'
import { resolveGeneralBenchmark } from '../../src/main/domain/benchmark'
import type { MatchSummary } from '../../src/shared/types'

function match(o: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: 'EUW1_x', puuid: 'me', queue: 420, champion: 'Ahri', role: 'Mid',
    win: o.win ?? true, kills: 8, deaths: o.deaths ?? 4, assists: 6, cs: 200,
    csPerMin: 6.4, gold: 12000, goldPerMin: 400, gameCreation: 1_700_000_000_000, gameDuration: 1800
  }
}

const features = computeSessionFeatures({
  matches: [match(), match({ win: false }), match()],
  profile: null,
  lpHistory: [],
  benchmark: resolveGeneralBenchmark('GOLD')
})

const validInsight = {
  leak: 'lead_conversion',
  headline: 'You win lane and lose the game',
  body: 'Group at 15 with a lead and take a tower.',
  evidence: 'avgKDA 3.1 · 38% WR',
  benchmarkBasis: null,
  confidence: 'established'
}

function toolMessage(input: unknown): { content: Array<{ type: string; name?: string; input?: unknown }> } {
  return { content: [{ type: 'tool_use', name: 'submit_analysis', input }] }
}

describe('parseSessionAnalysis', () => {
  it('accepts a well-formed payload', () => {
    const out = parseSessionAnalysis({ insights: [validInsight], noData: false })
    expect(out.noData).toBe(false)
    expect(out.insights).toHaveLength(1)
    expect(out.insights[0].leak).toBe('lead_conversion')
  })

  it('caps insights at four', () => {
    const out = parseSessionAnalysis({ insights: Array(6).fill(validInsight), noData: false })
    expect(out.insights).toHaveLength(4)
  })

  it('throws on an invalid leak category', () => {
    expect(() => parseSessionAnalysis({ insights: [{ ...validInsight, leak: 'tilt' }], noData: false })).toThrow()
  })

  it('throws on an insight missing required text', () => {
    expect(() => parseSessionAnalysis({ insights: [{ ...validInsight, body: '' }], noData: false })).toThrow()
  })

  it('throws when the payload is not an object', () => {
    expect(() => parseSessionAnalysis(null)).toThrow()
  })
})

describe('AnthropicSessionCoachingModel.analyzeSession', () => {
  it('calls the forced tool and returns the parsed analysis', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue(toolMessage({ insights: [validInsight], noData: false }))
    const model = new AnthropicSessionCoachingModel(create)
    const out = await model.analyzeSession(features, 'claude-sonnet-4-6')
    expect(out.insights).toHaveLength(1)
    expect(create).toHaveBeenCalledTimes(1)
    const params = (create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'submit_analysis' })
    expect(params.model).toBe('claude-sonnet-4-6')
  })

  it('rejects when no tool_use block is returned', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue({ content: [{ type: 'text' }] })
    const model = new AnthropicSessionCoachingModel(create)
    await expect(model.analyzeSession(features, 'm')).rejects.toThrow()
  })

  it('rejects on a malformed tool payload', async () => {
    const create: CreateMessage = vi.fn().mockResolvedValue(toolMessage({ insights: [{ ...validInsight, leak: 'nope' }] }))
    const model = new AnthropicSessionCoachingModel(create)
    await expect(model.analyzeSession(features, 'm')).rejects.toThrow()
  })
})
