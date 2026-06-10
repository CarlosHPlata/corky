import { useCallback, useEffect, useRef, useState } from 'react'
import type { EvidenceRef, Reflection } from '@shared/types'

// Reflections of one match (spec 005). Optimistic save/delete with
// reload-on-error: the list re-syncs from the store whenever a write fails, so
// the UI can never drift from SQLite for long. All operations are model-free
// and work offline (FR-014).

export interface ReflectionsApi {
  reflections: Reflection[]
  loading: boolean
  /** Absent id ⇒ create (player-authored); present ⇒ edit. */
  save: (text: string, refs: EvidenceRef[], id?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Re-read from the store (used after a coach proposal accept lands one). */
  reload: () => Promise<void>
}

export function useReflections(matchId: string): ReflectionsApi {
  const [reflections, setReflections] = useState<Reflection[]>([])
  const [loading, setLoading] = useState(true)
  const matchRef = useRef(matchId)
  matchRef.current = matchId

  const reload = useCallback(async (): Promise<void> => {
    try {
      const rows = await window.api.listReflections(matchId)
      if (matchRef.current === matchId) setReflections(rows)
    } catch { /* keep what we have; next action reloads */ }
  }, [matchId])

  useEffect(() => {
    setReflections([])
    setLoading(true)
    let alive = true
    void (async () => {
      try {
        const rows = await window.api.listReflections(matchId)
        if (alive) setReflections(rows)
      } catch { /* empty list; next action reloads */ }
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [matchId])

  const save = useCallback(async (text: string, refs: EvidenceRef[], id?: string): Promise<void> => {
    try {
      const saved = await window.api.saveReflection({ matchId, id, text, refs })
      if (matchRef.current !== matchId) return
      setReflections((cur) => {
        const i = cur.findIndex((r) => r.id === saved.id)
        if (i === -1) return cur.concat(saved)
        const next = [...cur]
        next[i] = saved
        return next
      })
    } catch {
      await reload() // e.g. at-cap error: re-sync so the composer hides
      throw new Error('save failed')
    }
  }, [matchId, reload])

  const remove = useCallback(async (id: string): Promise<void> => {
    const before = reflections
    setReflections((cur) => cur.filter((r) => r.id !== id)) // optimistic
    try {
      await window.api.deleteReflection(matchId, id)
    } catch {
      if (matchRef.current === matchId) setReflections(before)
    }
  }, [matchId, reflections])

  return { reflections, loading, save, remove, reload }
}
