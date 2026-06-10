import type {
  BudgetTier,
  CoachingConfigOverrides,
  ContextBlockInfo,
  DataSourceInfo,
  ResolvedCoachingConfig
} from '@shared/config'
import { listContextBlocks } from '../report/contextBlocks'
import { DATA_SOURCES } from './sourceRegistry'

// Pure. Merges the hardcoded registries (data sources + context blocks) with
// the stored overrides-only record. Unknown override ids are silently dropped;
// locked sources and alwaysOn blocks always resolve enabled, whatever the
// overrides claim. Restoring defaults is therefore just deleting the record.

export const DEFAULT_BUDGET_TIER: BudgetTier = 'standard'

const BUDGET_TIERS: readonly BudgetTier[] = ['eco', 'standard', 'deep']

/** Resolve the effective config: defaults + overrides (null ⇒ pure defaults). */
export function resolveConfig(overrides: CoachingConfigOverrides | null): ResolvedCoachingConfig {
  const sources: DataSourceInfo[] = DATA_SOURCES.map((meta) => {
    const { defaultEnabled, ...info } = meta
    const enabled = meta.lockedReason
      ? true
      : (overrides?.sources?.[meta.id] ?? defaultEnabled)
    return { ...info, usedBy: [...info.usedBy], enabled }
  })

  const blockDefaults = listContextBlocks()
  const blocks: ContextBlockInfo[] = blockDefaults.map((meta) => {
    const { defaultEnabled, ...info } = meta
    const enabled = meta.alwaysOn ? true : (overrides?.blocks?.[meta.id] ?? defaultEnabled)
    return { ...info, enabled }
  })

  const budgetTier =
    overrides?.budgetTier && BUDGET_TIERS.includes(overrides.budgetTier)
      ? overrides.budgetTier
      : DEFAULT_BUDGET_TIER

  const modified =
    budgetTier !== DEFAULT_BUDGET_TIER ||
    DATA_SOURCES.some((meta, i) => sources[i].enabled !== meta.defaultEnabled) ||
    blockDefaults.some((meta, i) => blocks[i].enabled !== meta.defaultEnabled)

  return { sources, blocks, budgetTier, modified }
}

/**
 * Reduce a full desired state to the overrides-only record: keep ONLY entries
 * that differ from their default, skipping locked sources, alwaysOn blocks and
 * unknown ids (none of them can deviate). Empty object fields are omitted, so
 * an all-defaults input yields `{ version: 1 }` — i.e. nothing to store.
 */
export function diffOverrides(desired: {
  sources: Record<string, boolean>
  blocks: Record<string, boolean>
  budgetTier: BudgetTier
}): CoachingConfigOverrides {
  const sources: Record<string, boolean> = {}
  for (const meta of DATA_SOURCES) {
    if (meta.lockedReason) continue
    const value = desired.sources[meta.id]
    if (typeof value === 'boolean' && value !== meta.defaultEnabled) sources[meta.id] = value
  }

  const blocks: Record<string, boolean> = {}
  for (const meta of listContextBlocks()) {
    if (meta.alwaysOn) continue
    const value = desired.blocks[meta.id]
    if (typeof value === 'boolean' && value !== meta.defaultEnabled) blocks[meta.id] = value
  }

  const overrides: CoachingConfigOverrides = { version: 1 }
  if (Object.keys(sources).length > 0) overrides.sources = sources
  if (Object.keys(blocks).length > 0) overrides.blocks = blocks
  if (desired.budgetTier !== DEFAULT_BUDGET_TIER) overrides.budgetTier = desired.budgetTier
  return overrides
}

/** True when the overrides record carries nothing worth storing. */
export function isEmptyOverrides(overrides: CoachingConfigOverrides): boolean {
  return !overrides.sources && !overrides.blocks && !overrides.budgetTier
}
