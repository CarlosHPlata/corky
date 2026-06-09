import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionAnalysis } from '@shared/types'

export type QuickAnalysisState = 'idle' | 'running' | 'done' | 'error' | 'noData'

// In-memory fast-path so navigating away and back to Home doesn't re-fetch or
// flash. The durable source of truth is the per-account store in the main
// process — `getSessionAnalysis()` restores it after resync or app restart.
let memCache: SessionAnalysis | null = null

function stateFor(a: SessionAnalysis): QuickAnalysisState {
  return a.noData ? 'noData' : 'done'
}

export interface QuickAnalysis {
  state: QuickAnalysisState
  result: SessionAnalysis | null
  error: string | null
  run: () => void
  retry: () => void
}

/**
 * Drives the Home "Quick analysis" card. On mount it restores the account's last
 * persisted analysis (so resync/restart never loses it); `run()` generates a
 * fresh one and the main process persists it.
 */
export function useQuickAnalysis(): QuickAnalysis {
  const [result, setResult] = useState<SessionAnalysis | null>(memCache)
  const [state, setState] = useState<QuickAnalysisState>(memCache ? stateFor(memCache) : 'idle')
  const [error, setError] = useState<string | null>(null)

  // Guards against overlapping runs (FR-016) — e.g. a double click.
  const inFlight = useRef(false)

  // Restore the persisted analysis once, unless we already have one in memory.
  useEffect(() => {
    if (memCache) return
    let cancelled = false
    window.api
      .getSessionAnalysis()
      .then((stored) => {
        if (cancelled || !stored) return
        memCache = stored
        setResult(stored)
        setState(stateFor(stored))
      })
      .catch(() => {
        /* a failed restore just leaves the card idle — the user can run it */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const run = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setState('running')
    setError(null)
    try {
      const analysis = await window.api.runSessionAnalysis()
      memCache = analysis
      setResult(analysis)
      setState(stateFor(analysis))
    } catch {
      setError("Corky couldn't finish the analysis. Check your connection and try again.")
      setState('error')
    } finally {
      inFlight.current = false
    }
  }, [])

  return { state, result, error, run, retry: run }
}
