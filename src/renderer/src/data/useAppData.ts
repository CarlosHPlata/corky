import { useCallback, useEffect, useRef, useState } from 'react'
import type { SummonerProfile, MatchSummary, LpSnapshot } from '@shared/types'
import { ensureDDLoaded } from '../utils/ddragon'

// A LoL game runs ~20–40 min, so a half-hour cadence catches new games soon
// after they finish without hammering the rate-limited personal Riot key.
const SYNC_INTERVAL_MS = 30 * 60 * 1000

export interface AppData {
  profile: SummonerProfile | null
  matches: MatchSummary[]
  lpHistory: LpSnapshot[]
  loading: boolean
  syncing: boolean
  error: string | null
  sync: () => Promise<void>
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Loads real summoner data from the main process. Shows cached data immediately,
 * then syncs on first open and on a fixed interval thereafter.
 */
export function useAppData(): AppData {
  const [profile, setProfile] = useState<SummonerProfile | null>(null)
  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [lpHistory, setLpHistory] = useState<LpSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guards against overlapping syncs (interval firing while one is in flight,
  // or React StrictMode double-invoking the mount effect in dev).
  const syncingRef = useRef(false)

  const refresh = useCallback(async () => {
    const [p, m, lp] = await Promise.all([
      window.api.getSummonerProfile(),
      window.api.getMatchList(),
      window.api.getLpHistory()
    ])
    setProfile(p)
    setMatches(m)
    setLpHistory(lp)
  }, [])

  const sync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setError(null)
    try {
      await Promise.all([window.api.syncProfile(), window.api.syncMatches(20)])
      await refresh()
    } catch (e) {
      setError(message(e))
    } finally {
      setSyncing(false)
      syncingRef.current = false
    }
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    ensureDDLoaded().catch(() => {})

    const init = async (): Promise<void> => {
      try {
        await refresh()
      } catch (e) {
        if (!cancelled) setError(message(e))
      }
      if (cancelled) return
      setLoading(false)
      void sync() // auto-sync on first open
    }
    void init()

    const id = setInterval(() => void sync(), SYNC_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [refresh, sync])

  return { profile, matches, lpHistory, loading, syncing, error, sync }
}
