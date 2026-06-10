import { useEffect, useRef, useState } from 'react'
import type { ChatTurn, EvidenceRef, ResolveProposalOutcome } from '@shared/types'

// Coaching chat session state (spec 005). Single-session mode for now: the
// newest stored session of the match is resumed, or a fresh draft is minted.
// US3 extends this hook with the metas listing + switcher + "New chat".
//
// Lazy creation (FR-020): a draft session becomes a SQLite row only once a
// player turn exists — abandoning an untouched chat leaves nothing behind.

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

export interface ChatSessionApi {
  msgs: ChatTurn[]
  /** False until this match's stored session finished loading — sends and
   * persistence stay blocked so the opener can never clobber a stored thread. */
  hydrated: boolean
  thinking: boolean
  resolving: boolean
  /** Legacy finalized reflection (chat_transcripts) — owned here until US5. */
  reflection: string
  setReflection: (text: string) => void
  send: (text: string, refs?: EvidenceRef[]) => Promise<void>
  resolve: (proposalId: string, decision: 'accept' | 'reject') => Promise<ResolveProposalOutcome | null>
  /** Append turns produced outside `send` (e.g. the finalize flow). */
  appendTurn: (turn: ChatTurn) => void
}

export function useChatSession(matchId: string, opener: ChatTurn): ChatSessionApi {
  const [msgs, setMsgs] = useState<ChatTurn[]>([opener])
  const [reflection, setReflection] = useState('')
  const [thinking, setThinking] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const sessionIdRef = useRef<string>(mintSessionId(matchId))
  const hydratedFor = useRef<string | null>(null)

  // Reset + hydrate when the game changes: resume the newest stored session,
  // adopt the legacy localStorage transcript when no session exists yet, or
  // start a fresh draft.
  useEffect(() => {
    hydratedFor.current = null
    setHydrated(false)
    setMsgs([opener]); setReflection(''); setThinking(false); setResolving(false)
    sessionIdRef.current = mintSessionId(matchId)
    const chatKey = 'ck-chat-' + matchId
    const reflectKey = 'ck-postreflect-' + matchId
    let alive = true
    void (async () => {
      let turns: ChatTurn[] | null = null
      try {
        const metas = await window.api.listChatSessions(matchId)
        if (metas.length > 0) {
          const stored = await window.api.getChatSession(metas[0].id)
          // Unreadable stored turns must NOT arm the save path — an "empty"
          // read would let the opener overwrite a real transcript.
          if (!stored) return
          sessionIdRef.current = stored.id
          turns = stored.turns.length > 0 ? stored.turns : null
        } else {
          const legacyTurns = loadLegacyChat(chatKey)
          if (legacyTurns) {
            // Deterministic id keeps this idempotent with the schema migration.
            const legacyId = `${matchId}-sess-legacy`
            try {
              await window.api.saveChatSession(matchId, legacyId, legacyTurns)
              localStorage.removeItem(chatKey)
              sessionIdRef.current = legacyId
              turns = legacyTurns
            } catch { /* key stays put; adoption retries next open */ }
          }
        }
      } catch {
        return // transient load failure: stay unhydrated, reopening retries
      }
      // Legacy finalized reflection — still served from chat_transcripts until
      // the Reflections panel (US2) and summarize flow (US5) replace it.
      let refl = ''
      try {
        const transcript = await window.api.getChatTranscript(matchId)
        refl = transcript?.reflection ?? ''
        if (!refl) {
          const legacyRefl = loadLegacyReflection(reflectKey)
          if (legacyRefl) {
            try {
              await window.api.saveChatReflection(matchId, legacyRefl)
              localStorage.removeItem(reflectKey)
              refl = legacyRefl
            } catch { /* retries next open */ }
          }
        }
      } catch { /* reflection is non-blocking */ }
      if (!alive) return
      setMsgs(turns || [opener])
      setReflection(refl)
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
    window.api.saveChatSession(matchId, sessionIdRef.current, msgs).catch(() => { /* next change retries */ })
  }, [msgs, matchId])

  async function send(text: string, refs?: EvidenceRef[]): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || thinking || hydratedFor.current !== matchId) return
    const next = msgs.concat(refs && refs.length ? { role: 'user', text: trimmed, refs } : { role: 'user', text: trimmed })
    setMsgs(next)
    setThinking(true)
    try {
      const reply = await window.api.coachChat(matchId, sessionIdRef.current, next)
      // Belt over the key braces: a continuation for another match's session
      // must never touch this transcript.
      if (hydratedFor.current !== matchId) return
      const assistant: ChatTurn = reply.proposalTurn ?? { role: 'assistant', text: reply.reply }
      setMsgs((cur) => cur.concat(assistant))
    } catch {
      if (hydratedFor.current !== matchId) return
      setMsgs((cur) => cur.concat({ role: 'assistant', text: "I couldn't reach my notes just now — try that again in a sec." }))
    } finally {
      setThinking(false)
    }
  }

  async function resolve(
    proposalId: string,
    decision: 'accept' | 'reject'
  ): Promise<ResolveProposalOutcome | null> {
    if (resolving || hydratedFor.current !== matchId) return null
    setResolving(true)
    try {
      const outcome = await window.api.resolveProposal({
        matchId,
        sessionId: sessionIdRef.current,
        proposalId,
        decision
      })
      if (hydratedFor.current !== matchId) return outcome
      setMsgs((cur) =>
        cur.map((t) =>
          t.proposal?.id === proposalId
            ? { ...t, proposal: { ...t.proposal, resolution: outcome.resolution, resolvedAt: Date.now() } }
            : t
        )
      )
      return outcome
    } catch {
      return null // card stays pending; player can retry
    } finally {
      setResolving(false)
    }
  }

  function appendTurn(turn: ChatTurn): void {
    if (hydratedFor.current !== matchId) return
    setMsgs((cur) => cur.concat(turn))
  }

  return { msgs, hydrated, thinking, resolving, reflection, setReflection, send, resolve, appendTurn }
}
