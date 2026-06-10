import { describe, it, expect } from 'vitest'
import type { BudgetTier, CoachingConfigOverrides } from '@shared/config'
import {
  DEFAULT_BUDGET_TIER,
  diffOverrides,
  isEmptyOverrides,
  resolveConfig
} from '../../src/main/domain/config/coachingConfig'
import { DATA_SOURCES } from '../../src/main/domain/config/sourceRegistry'
import { listContextBlocks } from '../../src/main/domain/report/contextBlocks'

function sourceEnabled(overrides: CoachingConfigOverrides | null, id: string): boolean {
  const s = resolveConfig(overrides).sources.find((x) => x.id === id)
  if (!s) throw new Error(`unknown source ${id}`)
  return s.enabled
}

function blockEnabled(overrides: CoachingConfigOverrides | null, id: string): boolean {
  const b = resolveConfig(overrides).blocks.find((x) => x.id === id)
  if (!b) throw new Error(`unknown block ${id}`)
  return b.enabled
}

/** Full desired state matching the defaults exactly. */
function defaultDesired(): {
  sources: Record<string, boolean>
  blocks: Record<string, boolean>
  budgetTier: BudgetTier
} {
  return {
    sources: Object.fromEntries(DATA_SOURCES.map((s) => [s.id, s.defaultEnabled])),
    blocks: Object.fromEntries(listContextBlocks().map((b) => [b.id, b.defaultEnabled])),
    budgetTier: DEFAULT_BUDGET_TIER
  }
}

describe('resolveConfig', () => {
  it('with null overrides yields pure defaults, unmodified', () => {
    const config = resolveConfig(null)
    expect(config.budgetTier).toBe('standard')
    expect(config.modified).toBe(false)
    expect(config.sources.map((s) => s.id)).toEqual(DATA_SOURCES.map((s) => s.id))
    for (const [i, meta] of DATA_SOURCES.entries()) {
      expect(config.sources[i].enabled).toBe(meta.defaultEnabled)
    }
    const blockMeta = listContextBlocks()
    expect(config.blocks.map((b) => b.id)).toEqual(blockMeta.map((b) => b.id))
    for (const [i, meta] of blockMeta.entries()) {
      expect(config.blocks[i].enabled).toBe(meta.defaultEnabled)
    }
    // Resolved entries never expose defaultEnabled — only the effective state.
    for (const entry of [...config.sources, ...config.blocks]) {
      expect(entry).not.toHaveProperty('defaultEnabled')
    }
  })

  it('applies partial overrides and leaves everything else at its default', () => {
    const overrides: CoachingConfigOverrides = {
      version: 1,
      sources: { 'riot-agent-lookups': true },
      blocks: { 'match.stats': false },
      budgetTier: 'deep'
    }
    const config = resolveConfig(overrides)
    expect(sourceEnabled(overrides, 'riot-agent-lookups')).toBe(true)
    expect(sourceEnabled(overrides, 'local-som')).toBe(true) // untouched default
    expect(blockEnabled(overrides, 'match.stats')).toBe(false)
    expect(blockEnabled(overrides, 'match.markers')).toBe(true) // untouched default
    expect(config.budgetTier).toBe('deep')
    expect(config.modified).toBe(true)
  })

  it('silently drops unknown override ids', () => {
    const overrides: CoachingConfigOverrides = {
      version: 1,
      sources: { 'no-such-source': false },
      blocks: { 'no.such.block': false }
    }
    const config = resolveConfig(overrides)
    expect(config.sources.map((s) => s.id)).toEqual(DATA_SOURCES.map((s) => s.id))
    expect(config.blocks.some((b) => b.id === 'no.such.block')).toBe(false)
    expect(config.modified).toBe(false)
  })

  it('ignores overrides on locked sources — they always resolve enabled', () => {
    const overrides: CoachingConfigOverrides = {
      version: 1,
      sources: { 'riot-match-v5': false, 'riot-league-v4': false }
    }
    expect(sourceEnabled(overrides, 'riot-match-v5')).toBe(true)
    expect(sourceEnabled(overrides, 'riot-league-v4')).toBe(true)
    expect(resolveConfig(overrides).modified).toBe(false)
  })

  it('ignores overrides on alwaysOn blocks — they always resolve enabled', () => {
    const overrides: CoachingConfigOverrides = {
      version: 1,
      blocks: { 'match.game': false, 'match.core': false }
    }
    expect(blockEnabled(overrides, 'match.game')).toBe(true)
    expect(blockEnabled(overrides, 'match.core')).toBe(true)
    expect(resolveConfig(overrides).modified).toBe(false)
  })

  it('flags modified for any single effective deviation', () => {
    expect(resolveConfig({ version: 1, sources: { 'local-som': false } }).modified).toBe(true)
    expect(resolveConfig({ version: 1, blocks: { 'match.benchmark': false } }).modified).toBe(true)
    expect(resolveConfig({ version: 1, budgetTier: 'eco' }).modified).toBe(true)
    // An override that restates the default is not a modification.
    expect(resolveConfig({ version: 1, sources: { 'local-som': true } }).modified).toBe(false)
    expect(resolveConfig({ version: 1, budgetTier: 'standard' }).modified).toBe(false)
  })
})

describe('diffOverrides', () => {
  it('yields an empty record (all fields omitted) for an all-defaults input', () => {
    const overrides = diffOverrides(defaultDesired())
    expect(overrides).toEqual({ version: 1 })
    expect(isEmptyOverrides(overrides)).toBe(true)
  })

  it('keeps only the entries that differ from their default', () => {
    const desired = defaultDesired()
    desired.sources['riot-agent-lookups'] = true // default false
    desired.blocks['match.markers'] = false // default true
    desired.budgetTier = 'eco'
    const overrides = diffOverrides(desired)
    expect(overrides).toEqual({
      version: 1,
      sources: { 'riot-agent-lookups': true },
      blocks: { 'match.markers': false },
      budgetTier: 'eco'
    })
    expect(isEmptyOverrides(overrides)).toBe(false)
  })

  it('skips locked sources, alwaysOn blocks and unknown ids', () => {
    const desired = defaultDesired()
    desired.sources['riot-match-v5'] = false // locked
    desired.sources['no-such-source'] = false // unknown
    desired.blocks['match.game'] = false // alwaysOn
    desired.blocks['no.such.block'] = false // unknown
    expect(diffOverrides(desired)).toEqual({ version: 1 })
  })

  it('round-trips: resolving the diff reproduces the desired effective state', () => {
    const desired = defaultDesired()
    desired.sources['opgg-mcp'] = false
    desired.sources['riot-agent-lookups'] = true
    desired.blocks['player.goal'] = false
    desired.blocks['carry.framing'] = false
    desired.budgetTier = 'deep'
    const config = resolveConfig(diffOverrides(desired))
    for (const s of config.sources) expect(s.enabled).toBe(desired.sources[s.id])
    for (const b of config.blocks) expect(b.enabled).toBe(desired.blocks[b.id])
    expect(config.budgetTier).toBe('deep')
    expect(config.modified).toBe(true)
    // And the diff of the resolved state is identical — stable fixed point.
    expect(
      diffOverrides({
        sources: Object.fromEntries(config.sources.map((s) => [s.id, s.enabled])),
        blocks: Object.fromEntries(config.blocks.map((b) => [b.id, b.enabled])),
        budgetTier: config.budgetTier
      })
    ).toEqual(diffOverrides(desired))
  })
})

describe('coachingConfig — prompt instructions', () => {
  const REVIEW_DEFAULT = resolveConfig(null).prompts.find((p) => p.id === 'review')!.instructions

  it('resolves every registry prompt with its default text and no flags', () => {
    const prompts = resolveConfig(null).prompts
    expect(prompts.length).toBeGreaterThanOrEqual(7)
    for (const p of prompts) {
      expect(p.instructions.length).toBeGreaterThan(0)
      expect(p.modified).toBe(false)
      expect(p.staleDefault).toBe(false)
    }
  })

  it('round-trips an edited prompt through diff → resolve', () => {
    const overrides = diffOverrides({
      ...defaultDesired(),
      prompts: { review: 'Be extremely gentle and encouraging.' }
    })
    expect(overrides.prompts?.review?.text).toBe('Be extremely gentle and encouraging.')
    const resolved = resolveConfig(overrides)
    const review = resolved.prompts.find((p) => p.id === 'review')!
    expect(review.instructions).toBe('Be extremely gentle and encouraging.')
    expect(review.modified).toBe(true)
    expect(review.staleDefault).toBe(false)
    expect(resolved.modified).toBe(true)
  })

  it('default-equal and blank texts store no override (restore by equality)', () => {
    const same = diffOverrides({ ...defaultDesired(), prompts: { review: REVIEW_DEFAULT } })
    expect(same.prompts).toBeUndefined()
    expect(isEmptyOverrides(same)).toBe(true)
    const blank = diffOverrides({ ...defaultDesired(), prompts: { review: '   ' } })
    expect(blank.prompts).toBeUndefined()
  })

  it('flags staleDefault when the stored baseHash no longer matches the default', () => {
    const overrides: CoachingConfigOverrides = {
      version: 1,
      prompts: { review: { text: 'Custom voice.', baseHash: 'deadbeef' } }
    }
    const review = resolveConfig(overrides).prompts.find((p) => p.id === 'review')!
    expect(review.modified).toBe(true)
    expect(review.staleDefault).toBe(true)
  })

  it('drops unknown prompt ids on resolve and diff', () => {
    const overrides: CoachingConfigOverrides = {
      version: 1,
      prompts: { nonsense: { text: 'x', baseHash: '0' } }
    }
    expect(resolveConfig(overrides).modified).toBe(false)
    const diffed = diffOverrides({ ...defaultDesired(), prompts: { nonsense: 'x' } })
    expect(diffed.prompts).toBeUndefined()
  })
})
