import { useEffect, useState } from 'react'
import type { ChampSelectState } from '@shared/types'
import { ensureDDLoaded, ensureLoadoutDataLoaded } from '../utils/ddragon'

export interface ChampSelectData {
  /** Live champ-select state, or null when not in champ select. */
  state: ChampSelectState | null
  /** Data Dragon (champions + spells/runes) is loaded, so id→icon resolves. */
  ddReady: boolean
}

/**
 * Live champ-select state (spec 007). Reads the current state on mount, then
 * stays current via the `champSelect:changed` push as picks/bans progress. A
 * push with `active: false` (champ select ended) clears it to null.
 */
export function useChampSelect(): ChampSelectData {
  const [state, setState] = useState<ChampSelectState | null>(null)
  const [ddReady, setDdReady] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([ensureDDLoaded(), ensureLoadoutDataLoaded()])
      .then(() => {
        if (alive) setDdReady(true)
      })
      .catch(() => {})

    window.api
      .getChampSelectState()
      .then((s) => {
        if (alive) setState(s)
      })
      .catch(() => {})

    const unsubscribe = window.api.onChampSelectChanged((s) => setState(s.active ? s : null))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return { state, ddReady }
}
