import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionGoal, SessionGoalInput } from '@shared/types'

// Client-side caps mirror the server's authoritative limits (domain
// `normalizeSessionGoal`): goal ≤ 200, notes ≤ 1000. The renderer also sets
// `maxLength` on the inputs; this is the belt-and-braces trim used by the stub
// before the backend is wired.
const GOAL_MAX = 200
const NOTES_MAX = 1000

export interface UseSessionGoal {
  /** The saved goal, or null when never set. */
  value: SessionGoal | null
  /** True while editing (read/empty → edit). */
  editing: boolean
  /** The in-progress edit buffer. */
  draft: SessionGoalInput
  /** True once goal or notes have non-blank content. */
  hasContent: boolean
  startEdit: () => void
  cancel: () => void
  setGoal: (goal: string) => void
  setNotes: (notes: string) => void
  /** Persist the draft (server trims + caps) and leave edit mode. */
  save: () => void
}

const EMPTY_DRAFT: SessionGoalInput = { goal: '', notes: '' }

function hasContentOf(v: { goal: string; notes: string } | null): boolean {
  return !!v && (!!v.goal.trim() || !!v.notes.trim())
}

/**
 * Drives the Home "Session goal & notes" card. On mount it restores the saved
 * goal; editing keeps a local draft; `save` persists it. Built frontend-first
 * against a stub (Constitution VIII) — the data-source calls are isolated so
 * wiring to `window.api` is a localized swap.
 */
export function useSessionGoal(): UseSessionGoal {
  const [value, setValue] = useState<SessionGoal | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SessionGoalInput>(EMPTY_DRAFT)
  const inFlight = useRef(false)

  // Restore the saved goal once, from the main-process store.
  useEffect(() => {
    let cancelled = false
    window.api
      .getSessionGoal()
      .then((stored) => {
        if (!cancelled && stored) setValue(stored)
      })
      .catch(() => {
        /* a failed restore just leaves the card in its empty state */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const startEdit = useCallback(() => {
    setDraft({ goal: value?.goal ?? '', notes: value?.notes ?? '' })
    setEditing(true)
  }, [value])

  const cancel = useCallback(() => {
    setDraft(EMPTY_DRAFT)
    setEditing(false)
  }, [])

  const setGoal = useCallback((goal: string) => setDraft((d) => ({ ...d, goal })), [])
  const setNotes = useCallback((notes: string) => setDraft((d) => ({ ...d, notes })), [])

  const save = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    const input: SessionGoalInput = {
      goal: draft.goal.trim().slice(0, GOAL_MAX),
      notes: draft.notes.trim().slice(0, NOTES_MAX)
    }
    try {
      const saved = await window.api.saveSessionGoal(input)
      setValue(saved)
      setEditing(false)
      setDraft(EMPTY_DRAFT)
    } finally {
      inFlight.current = false
    }
  }, [draft])

  return {
    value,
    editing,
    draft,
    hasContent: hasContentOf(value),
    startEdit,
    cancel,
    setGoal,
    setNotes,
    save
  }
}
