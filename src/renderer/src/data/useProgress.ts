import { useEffect, useState } from 'react'
import type { ProgressSummary } from '@shared/types'

export interface UseProgress {
  progress: ProgressSummary | null
  loading: boolean
}

/**
 * Restores the player's coaching progress (standing-task track records, what
 * Corky is working on, banked wins) for the Home "Progress" card. Deterministic
 * and read-only, fetched on mount — no model call. Null until the first game is
 * analysed produces anything; the card shows its empty state then.
 */
export function useProgress(): UseProgress {
  const [progress, setProgress] = useState<ProgressSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    window.api
      .getProgress()
      .then((p) => {
        if (alive) setProgress(p)
      })
      .catch(() => {
        /* a failed restore just leaves the card in its empty state */
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { progress, loading }
}
