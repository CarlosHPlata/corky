import { useEffect, useRef, useState } from 'react'
import type { MatchReport } from '@shared/types'

export interface MatchReportState {
  report: MatchReport | null
  loading: boolean
  /** Match wasn't found locally (query returned null). */
  notFound: boolean
  error: string | null
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Load the factual, computed report for one match (US2–US4). The report is built
 * on read from the stored match + timeline JSON, so it resolves quickly and works
 * offline for any synced game.
 */
export function useMatchReport(matchId: string | null): MatchReportState {
  const [report, setReport] = useState<MatchReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (!matchId) return
    const id = ++reqId.current
    setLoading(true)
    setNotFound(false)
    setError(null)
    window.api
      .getMatchReport(matchId)
      .then((r) => {
        if (id !== reqId.current) return // a newer match superseded this load
        setReport(r)
        setNotFound(r === null)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        setError(message(e))
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [matchId])

  return { report, loading, notFound, error }
}
