import { useEffect, useRef, useState } from 'react'
import type { ChatSessionMeta, ChatTurn, EvidenceRef, ResolveProposalOutcome } from '@shared/types'

// Coaching chat sessions of one match (spec 005, Claude-style). The newest
// stored session is resumed on open; "New chat" starts a renderer-only DRAFT
// (opener turn, no row) and the switcher moves between stored threads.
//
// Lazy creation (FR-020): a draft becomes a SQLite row only once a player turn
// exists — abandoning an untouched chat leaves nothing behind.
//
// Context note: every session's coach context is rebuilt server-side per call
// (match facts + read + standing tasks + ALL reflections + memory), so a fresh
// session starts factually warm with a clean transcript (FR-018).

function mintSessionId(matchId: string): string {
  return `${matchId}-sess-${Date.now().toString(36)}`
}

// Legacy renderer-local store (pre-005) — adopted once, then the keys drop.
function loadLegacyChat(key: string): ChatTurn[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null')
    return Array.isArray(v) && v.length > 0 ? v : null
  } catch {
    return null
  }
}
function loadLegacyReflection(key: string): string {
  try {
    const raw = localStorage.getItem(key)
    if (raw) { const v = JSON.parse(raw); return typeof v === 'string' ? v : (v?.text || '') }
  } catch { /* ignore */ }
  return ''
}

export interface ChatSessionsApi {
  msgs: ChatTurn[]
  /** Stored sessions of this match, newest first (drafts are not listed until
   * their first player turn persists them). */
  metas: ChatSessionMeta[]
  /** The active session id — a stored id or the current draft's. */
  activeId: string
  /** True while the active session is a never-persisted draft. */
  isDraft: boolean
  /** False until the active session finished loading — sends and persistence
   * stay blocked so the opener can never clobber a stored thread. */
  hydrated: boolean
  thinking: boolean
  resolving: boolean
  send: (text: string, refs?: EvidenceRef[]) => Promise<void>
  resolve: (proposalId: string, decision: 'accept' | 'reject') => Promise<ResolveProposalOutcome | null>
  /** Switch to a stored session (no-op for the active one). */
  switchTo: (sessionId: string) => Promise<void>
  /** Start a fresh draft session (reuses the current draft if still untouched). */
  newChat: () => void
}

export function useChatSessions(matchId: string, opener: ChatTurn): ChatSessionsApi {
  const [msgs, setMsgs] = useState<ChatTurn[]>([opener])
  const [metas, setMetas] = useState<ChatSessionMeta[]>([])
  const [activeId, setActiveId] = useState<string>(() => mintSessionId(matchId))
  const [isDraft, setIsDraft] = useState(true)
  const [thinking, setThinking] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const sessionIdRef = useRef<string>(activeId)
  const hydratedFor = useRef<string | null>(null)

  function activate(sessionId: string, turns: ChatTurn[], draft: boolean): void {
    sessionIdRef.current = sessionId
    setActiveId(sessionId)
    setIsDraft(draft)
    setMsgs(turns)
  }

  // Reset + hydrate when the game changes: resume the newest stored session,
  // adopt the legacy localStorage transcript/reflection when nothing exists
  // yet, or start a fresh draft.
  useEffect(() => {
    hydratedFor.current = null
    setHydrated(false)
    setMetas([])
    setThinking(false); setResolving(false)
    activate(mintSessionId(matchId), [opener], true)
    const chatKey = 'ck-chat-' + matchId
    const reflectKey = 'ck-postreflect-' + matchId
    let alive = true
    void (async () => {
      try {
        let stored = await window.api.listChatSessions(matchId)
        if (stored.length === 0) {
          // Adopt the pre-005 renderer-local transcript as the first session;
          // the deterministic id keeps this idempotent with the migration.
          const legacyTurns = loadLegacyChat(chatKey)
          if (legacyTurns) {
            try {
              const meta = await window.api.saveChatSession(matchId, `${matchId}-sess-legacy`, legacyTurns)
              localStorage.removeItem(chatKey)
              stored = [meta]
            } catch { /* key stays put; adoption retries next open */ }
          }
        }
        if (!alive) return
        setMetas(stored)
        if (stored.length > 0) {
          const newest = await window.api.getChatSession(stored[0].id)
          if (!alive) return
          // Unreadable stored turns must NOT arm the save path — an "empty"
          // read would let the opener overwrite a real transcript.
          if (!newest) return
          activate(newest.id, newest.turns.length > 0 ? newest.turns : [opener], false)
        }
      } catch {
        return // transient load failure: stay unhydrated, reopening retries
      }
      // Pre-005 renderer-local reflection → the reflections store (US2).
      const legacyRefl = loadLegacyReflection(reflectKey)
      if (legacyRefl) {
        try {
          await window.api.saveReflection({ matchId, id: `${matchId}-refl-legacy`, text: legacyRefl, refs: [] })
          localStorage.removeItem(reflectKey)
        } catch { /* retries next open */ }
      }
      if (!alive) return
      hydratedFor.current = matchId
      setHydrated(true)
    })()
    return () => { alive = false }
  }, [matchId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist on every transcript change once hydrated — but only when a player
  // turn exists (lazy creation: drafts never become rows).
  useEffect(() => {
    if (hydratedFor.current !== matchId) return
    if (!msgs.some((m) => m.role === 'user')) return
    const sid = sessionIdRef.current
    window.api
      .saveChatSession(matchId, sid, msgs)
      .then((meta) => {
        setIsDraft(false)
        setMetas((cur) => {
          const i = cur.findIndex((m) => m.id === meta.id)
          if (i === -1) return [meta, ...cur]
          const next = [...cur]
          next[i] = meta
          return next
        })
      })
      .catch(() => { /* next change retries */ })
  }, [msgs, matchId])

  /** True when a continuation may still apply: same match AND same session. */
  function stillCurrent(sid: string): boolean {
    return hydratedFor.current === matchId && sessionIdRef.current === sid
  }

  async function send(text: string, refs?: EvidenceRef[]): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || thinking || hydratedFor.current !== matchId) return
    const sid = sessionIdRef.current
    const next = msgs.concat(refs && refs.length ? { role: 'user', text: trimmed, refs } : { role: 'user', text: trimmed })
    setMsgs(next)
    setThinking(true)
    try {
      const reply = await window.api.coachChat(matchId, sid, next)
      if (!stillCurrent(sid)) return
      const assistant: ChatTurn = reply.proposalTurn ?? { role: 'assistant', text: reply.reply }
      setMsgs((cur) => cur.concat(assistant))
    } catch {
      if (!stillCurrent(sid)) return
      setMsgs((cur) => cur.concat({ role: 'assistant', text: "I couldn't reach my notes just now — try that again in a sec." }))
    } finally {
      if (stillCurrent(sid)) setThinking(false)
    }
  }

  async function resolve(
    proposalId: string,
    decision: 'accept' | 'reject'
  ): Promise<ResolveProposalOutcome | null> {
    if (resolving || hydratedFor.current !== matchId) return null
    const sid = sessionIdRef.current
    setResolving(true)
    try {
      const outcome = await window.api.resolveProposal({ matchId, sessionId: sid, proposalId, decision })
      if (stillCurrent(sid)) {
        setMsgs((cur) =>
          cur.map((t) =>
            t.proposal?.id === proposalId
              ? { ...t, proposal: { ...t.proposal, resolution: outcome.resolution, resolvedAt: Date.now() } }
              : t
          )
        )
      }
      return outcome
    } catch {
      return null // card stays pending; player can retry
    } finally {
      if (stillCurrent(sid)) setResolving(false)
    }
  }

  async function switchTo(sessionId: string): Promise<void> {
    if (sessionId === sessionIdRef.current || hydratedFor.current !== matchId) return
    const stored = await window.api.getChatSession(sessionId)
    if (hydratedFor.current !== matchId) return
    if (!stored) return // unreadable: stay where we are rather than show empty
    setThinking(false); setResolving(false)
    activate(stored.id, stored.turns.length > 0 ? stored.turns : [opener], false)
  }

  function newChat(): void {
    if (hydratedFor.current !== matchId) return
    if (isDraft && !msgs.some((m) => m.role === 'user')) return // reuse untouched draft
    setThinking(false); setResolving(false)
    activate(mintSessionId(matchId), [opener], true)
  }

  return { msgs, metas, activeId, isDraft, hydrated, thinking, resolving, send, resolve, switchTo, newChat }
}
