import { useCallback, useEffect, useRef, useState } from 'react'
import type { MatchAnalysis } from '@shared/types'

export type AnalysisState = 'idle' | 'running' | 'done' | 'partial' | 'error'

export interface UseMatchAnalysis {
  analysis: MatchAnalysis | null
  state: AnalysisState
  /** Run (or re-run with force) the four-pass analysis for this match. */
  run: (force?: boolean) => void
  /** Replace the in-memory read with a server-returned one (e.g. after the coach
   * chat re-shapes the standing focus tasks) — no model call. */
  apply: (analysis: MatchAnalysis) => void
}

// The player's stated intent fed into the analysis context as NOTE lines —
// sourced from the reflections they wrote by hand on this game (the panel is
// model-free, so reflections can exist before any analysis run). Only
// player-authored ones: a coach reflection is Corky's own prior output and must
// never be replayed back as the player's intent.
async function readReflection(matchId: string): Promise<string | undefined> {
  try {
    const rows = await window.api.listReflections(matchId)
    const text = rows
      .filter((r) => r.source === 'player')
      .map((r) => r.text.trim())
      .filter(Boolean)
      .join('\n\n')
    return text || undefined
  } catch {
    return undefined
  }
}

/**
 * Drives "Corky's read" for one match. On mount it restores the stored analysis
 * with no model call (FR-027/SC-008); `run` triggers a fresh analysis. State
 * survives app restart because the read is persisted (the hook just rehydrates).
 */
export function useMatchAnalysis(matchId: string): UseMatchAnalysis {
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null)
  const [state, setState] = useState<AnalysisState>('idle')
  const inFlight = useRef(false)

  const settle = useCallback((a: MatchAnalysis | null) => {
    setAnalysis(a)
    setState(a ? a.status : 'idle')
  }, [])

  // Rehydrate the stored read on open — no analysis run (SC-008).
  useEffect(() => {
    let alive = true
    setAnalysis(null)
    setState('idle')
    window.api
      .getMatchAnalysis(matchId)
      .then((a) => {
        if (alive) settle(a)
      })
      .catch(() => {
        if (alive) setState('idle')
      })
    return () => {
      alive = false
    }
  }, [matchId, settle])

  const run = useCallback(
    (force?: boolean) => {
      if (inFlight.current) return // no overlapping runs (FR-004)
      inFlight.current = true
      setState('running')
      void (async () => {
        try {
          const reflection = await readReflection(matchId)
          settle(await window.api.analyzeMatch(matchId, { force, reflection }))
        } catch {
          setState('error')
        } finally {
          inFlight.current = false
        }
      })()
    },
    [matchId, settle]
  )

  const apply = useCallback((a: MatchAnalysis) => settle(a), [settle])

  return { analysis, state, run, apply }
}
