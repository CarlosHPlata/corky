import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BudgetTier,
  ResolvedCoachingConfig,
  SaveCoachingConfigInput,
} from '@shared/config'

export interface UseCoachingConfig {
  config: ResolvedCoachingConfig | null
  loading: boolean
  saving: boolean
  setSource: (id: string, on: boolean) => void
  setBlock: (id: string, on: boolean) => void
  setTier: (tier: BudgetTier) => void
  setPromptInstructions: (id: string, text: string) => void
  /** Back to the hardcoded default — a blank text stores no override. */
  restorePrompt: (id: string) => void
  restoreDefaults: () => void
}

/** Flattens the resolved config into the full desired-state shape the save API expects. */
function toInput(config: ResolvedCoachingConfig): SaveCoachingConfigInput {
  const sources: Record<string, boolean> = {}
  for (const s of config.sources) sources[s.id] = s.enabled
  const blocks: Record<string, boolean> = {}
  for (const b of config.blocks) blocks[b.id] = b.enabled
  const prompts: Record<string, string> = {}
  for (const p of config.prompts) prompts[p.id] = p.instructions
  return { sources, blocks, budgetTier: config.budgetTier, prompts }
}

/**
 * Loads and mutates the coaching configuration (data sources, context blocks,
 * budget tier) for the Settings screen. Every toggle saves immediately — a
 * cheap single-row write — by sending the FULL desired state built from the
 * current config; state is then replaced with the resolved config the main
 * process returns, so locked/always-on corrections flow back automatically.
 */
export function useCoachingConfig(): UseCoachingConfig {
  const [config, setConfig] = useState<ResolvedCoachingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const alive = useRef(true)
  // The latest DESIRED state, mutations applied client-side in order. Every save
  // builds from this ref, never from the React state: two rapid interactions
  // (e.g. a prompt textarea blur + a toggle click) would otherwise both build
  // from the same stale config and the second save would silently undo the first.
  const desired = useRef<SaveCoachingConfigInput | null>(null)

  useEffect(() => {
    alive.current = true
    window.api
      .getCoachingConfig()
      .then((c) => {
        desired.current = toInput(c)
        if (alive.current) setConfig(c)
      })
      .catch(() => {
        /* a failed load leaves the cards in their loading-empty state */
      })
      .finally(() => {
        if (alive.current) setLoading(false)
      })
    return () => {
      alive.current = false
    }
  }, [])

  const save = useCallback((input: SaveCoachingConfigInput) => {
    setSaving(true)
    window.api
      .saveCoachingConfig(input)
      .then((c) => {
        if (alive.current) setConfig(c)
      })
      .catch(() => {
        /* keep the last known state; the next toggle retries from it */
      })
      .finally(() => {
        if (alive.current) setSaving(false)
      })
  }, [])

  /** Apply one mutation on top of the desired-state mirror and save the result. */
  const mutate = useCallback(
    (apply: (input: SaveCoachingConfigInput) => void) => {
      if (!desired.current) return
      const input: SaveCoachingConfigInput = {
        sources: { ...desired.current.sources },
        blocks: { ...desired.current.blocks },
        budgetTier: desired.current.budgetTier,
        prompts: { ...desired.current.prompts },
      }
      apply(input)
      desired.current = input
      save(input)
    },
    [save],
  )

  const setSource = useCallback(
    (id: string, on: boolean) => mutate((input) => { input.sources[id] = on }),
    [mutate],
  )

  const setBlock = useCallback(
    (id: string, on: boolean) => mutate((input) => { input.blocks[id] = on }),
    [mutate],
  )

  const setTier = useCallback(
    (tier: BudgetTier) => mutate((input) => { input.budgetTier = tier }),
    [mutate],
  )

  const setPromptInstructions = useCallback(
    (id: string, text: string) => mutate((input) => { input.prompts[id] = text }),
    [mutate],
  )

  const restorePrompt = useCallback(
    (id: string) => mutate((input) => { input.prompts[id] = '' }),
    [mutate],
  )

  const restoreDefaults = useCallback(() => {
    if (!config) return
    const ok = window.confirm(
      'Restore all coaching defaults? Sources, data points, budget and prompts go back to install settings.',
    )
    if (!ok) return
    setSaving(true)
    window.api
      .restoreCoachingConfigDefaults()
      .then((c) => {
        desired.current = toInput(c)
        if (alive.current) setConfig(c)
      })
      .catch(() => {
        /* keep the last known state */
      })
      .finally(() => {
        if (alive.current) setSaving(false)
      })
  }, [config])

  return {
    config,
    loading,
    saving,
    setSource,
    setBlock,
    setTier,
    setPromptInstructions,
    restorePrompt,
    restoreDefaults
  }
}
