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

function readReflection(matchId: string): string | undefined {
  try {
    const raw = localStorage.getItem('ck-reflections-' + matchId)
    if (!raw) return undefined
    const v = JSON.parse(raw)
    const text = typeof v === 'string' ? v : v?.text
    return typeof text === 'string' && text.trim() ? text : undefined
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
      window.api
        .analyzeMatch(matchId, { force, reflection: readReflection(matchId) })
        .then((a) => settle(a))
        .catch(() => setState('error'))
        .finally(() => {
          inFlight.current = false
        })
    },
    [matchId, settle]
  )

  const apply = useCallback((a: MatchAnalysis) => settle(a), [settle])

  return { analysis, state, run, apply }
}
