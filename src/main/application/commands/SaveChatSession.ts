import type { ChatSessionMeta, ChatTurn } from '@shared/types'
import type { ChatSessionRepository } from '../ports/ChatSessionRepository'

/** Stamp the create-time title for a session. The deterministic legacy id keeps
 * the renderer's localStorage adoption idempotent with the schema migration. */
function titleFor(sessionId: string, at: number): string {
  if (sessionId.endsWith('-sess-legacy')) return 'First session'
  const d = new Date(at)
  const month = d.toLocaleString('en-US', { month: 'short' })
  const minutes = d.getMinutes().toString().padStart(2, '0')
  return `Chat · ${month} ${d.getDate()}, ${d.getHours()}:${minutes}`
}

/**
 * Persists one chat session's transcript (spec 005). Lazy creation: the
 * renderer only calls this once a player turn exists, so empty drafts never
 * become rows. The title is stamped server-side on create; proposal
 * resolutions embedded in turns are clamped by the repository (resolutions
 * only move through ResolveProposal).
 */
export class SaveChatSession {
  constructor(
    private readonly sessions: ChatSessionRepository,
    private readonly now: () => number = () => Date.now()
  ) {}

  execute(matchId: string, sessionId: string, turns: ChatTurn[]): ChatSessionMeta {
    if (!sessionId.startsWith(`${matchId}-sess-`)) {
      throw new Error('Session id does not belong to this match')
    }
    return this.sessions.upsert(sessionId, matchId, titleFor(sessionId, this.now()), turns)
  }
}
