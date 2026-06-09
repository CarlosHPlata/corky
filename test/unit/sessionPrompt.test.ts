import { describe, it, expect } from 'vitest'
import { buildSessionPrompt, SUBMIT_TOOL } from '../../src/main/adapters/driven/anthropic/sessionPrompt'
import { computeSessionFeatures } from '../../src/main/domain/sessionFeatures'
import { resolveGeneralBenchmark } from '../../src/main/domain/benchmark'
import type { MatchSummary } from '../../src/shared/types'

function match(o: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: 'EUW1_x', puuid: 'me', queue: 420,
    champion: o.champion ?? 'Ahri', role: o.role ?? 'Mid', win: o.win ?? true,
    kills: o.kills ?? 8, deaths: o.deaths ?? 4, assists: o.assists ?? 6,
    cs: 200, csPerMin: o.csPerMin ?? 6.4, gold: 12000, goldPerMin: 400,
    gameCreation: o.gameCreation ?? 1_700_000_000_000, gameDuration: 1800
  }
}

const features = computeSessionFeatures({
  matches: [match({ win: false, deaths: 9 }), match({ win: true, deaths: 3 }), match({ champion: 'Syndra', win: false, deaths: 7 })],
  profile: null,
  lpHistory: [],
  benchmark: resolveGeneralBenchmark('BRONZE')
})

describe('buildSessionPrompt', () => {
  const { system, user } = buildSessionPrompt(features)

  it('encodes the hard coaching rules in the system prompt', () => {
    expect(system).toMatch(/Diagnose, don't describe/i)
    expect(system).toMatch(/never (invent|state)/i)
    expect(system).toMatch(/provisional/i)
    expect(system).toMatch(/next-game action/i)
    expect(system).toMatch(/submit_analysis/)
  })

  it('serializes the computed facts the model must reason over', () => {
    expect(user).toMatch(/Deaths per game/i)
    expect(user).toMatch(/in losses/i)
    expect(user).toMatch(/CS\/min/i)
    expect(user).toMatch(/benchmark basis: general/i)
    expect(user).toMatch(/Champion pool/i)
    expect(user).toContain('Ahri')
    expect(user).toContain('Syndra')
  })

  it('exposes the forced tool with the insight schema', () => {
    expect(SUBMIT_TOOL.name).toBe('submit_analysis')
    const leak = SUBMIT_TOOL.input_schema.properties.insights.items.properties.leak
    expect(leak.enum).toContain('lead_conversion')
    expect(SUBMIT_TOOL.input_schema.required).toContain('insights')
  })
})

describe('buildSessionPrompt with player intent (US2)', () => {
  it('includes the goal + notes as stated intent, flagged as not a computed fact', () => {
    const { user } = buildSessionPrompt(features, {
      goal: 'Convert one 20-minute lead into a closed game.',
      notes: 'Stop forcing river plays when ahead.\nWard before objectives.'
    })
    expect(user).toContain('Convert one 20-minute lead into a closed game.')
    expect(user).toContain('Stop forcing river plays when ahead.')
    expect(user).toMatch(/stated intent|their own words|NOT a computed fact/i)
    // The guardrail: never echo the goal as evidence, never invent figures to fit it.
    expect(user).toMatch(/evidence/i)
  })

  it('omits the intent block entirely when no context is given (byte-for-byte today)', () => {
    const without = buildSessionPrompt(features).user
    const undefinedCtx = buildSessionPrompt(features, undefined).user
    expect(undefinedCtx).toBe(without)
    expect(without).not.toMatch(/stated intent/i)
    expect(without).not.toMatch(/^\s*Goal:/m)
  })

  it('treats empty goal + notes as no intent (no block)', () => {
    const empty = buildSessionPrompt(features, { goal: '', notes: '' }).user
    expect(empty).toBe(buildSessionPrompt(features).user)
  })
})
