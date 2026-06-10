import { useEffect, useState } from 'react'
import type { StandingFocusTask } from '@shared/types'

export interface UseStandingTasks {
  tasks: StandingFocusTask[]
  loading: boolean
}

/**
 * Restores the player's current standing focus tasks (global, 1–3) for the Home
 * "Next-game focus" card. Read-only, fetched on mount — no model call. Empty
 * until the first game is analysed; the card shows its own empty state then.
 */
export function useStandingTasks(): UseStandingTasks {
  const [tasks, setTasks] = useState<StandingFocusTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    window.api
      .getStandingTasks()
      .then((t) => {
        if (alive) setTasks(t)
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

  return { tasks, loading }
}
