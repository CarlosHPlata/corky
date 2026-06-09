import { useCallback, useEffect, useRef, useState } from 'react'
import type { MatchSummary } from '@shared/types'

const PAGE_SIZE = 20

export interface MatchHistory {
  matches: MatchSummary[]
  /** Initial page load (no matches shown yet). */
  loading: boolean
  /** Appending an additional page (matches already shown). */
  loadingMore: boolean
  /** No more matches locally or remotely. */
  done: boolean
  error: string | null
  /** Request the next (older) page — call as the scroll nears the end. */
  loadMore: () => void
  /** Retry after a page-fetch error. */
  retry: () => void
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Infinite-scroll match list (US1). Pages over the local DB via `getMatchPage`;
 * when the local store is exhausted it fetches one older Riot window via
 * `syncMatches(count, start)` and continues — stopping when a remote fetch yields
 * nothing new (FR-003/005/006/009).
 */
export function useMatchHistory(): MatchHistory {
  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cursor = useRef<string | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const inFlight = useRef(false)
  const triedRemoteAtCount = useRef(-1) // guards against looping older-window syncs

  const append = useCallback((incoming: MatchSummary[]) => {
    const fresh = incoming.filter((m) => !seen.current.has(m.matchId))
    fresh.forEach((m) => seen.current.add(m.matchId))
    if (fresh.length) setMatches((prev) => [...prev, ...fresh])
    return fresh.length
  }, [])

  const loadMore = useCallback(async () => {
    if (inFlight.current || done) return
    inFlight.current = true
    const initial = seen.current.size === 0
    if (initial) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const page = await window.api.getMatchPage({ before: cursor.current, limit: PAGE_SIZE })
      const added = append(page.matches)
      if (page.nextCursor) cursor.current = page.nextCursor

      if (page.matches.length === 0 || (page.hasMoreRemote && added === 0)) {
        // Local store is exhausted for this cursor.
        const count = seen.current.size
        if (page.hasMoreRemote && triedRemoteAtCount.current !== count) {
          // Pull one older Riot window, then let the next loadMore page into it.
          triedRemoteAtCount.current = count
          await window.api.syncMatches(PAGE_SIZE, count)
          const after = await window.api.getMatchPage({ before: cursor.current, limit: PAGE_SIZE })
          const addedAfter = append(after.matches)
          if (after.nextCursor) cursor.current = after.nextCursor
          if (addedAfter === 0) setDone(true)
        } else {
          setDone(true)
        }
      }
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
      setLoadingMore(false)
      inFlight.current = false
    }
  }, [append, done])

  const retry = useCallback(() => {
    setError(null)
    void loadMore()
  }, [loadMore])

  // First page on mount.
  useEffect(() => {
    void loadMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { matches, loading, loadingMore, done, error, loadMore, retry }
}
