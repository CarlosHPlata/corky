import type { ChatSession, ChatSessionMeta } from '@shared/types'
import type { ChatSessionRepository } from '../ports/ChatSessionRepository'

/**
 * Read side of the per-match chat sessions (spec 005): the switcher's listing
 * and a single session's full transcript. A corrupt stored transcript reads as
 * null — the renderer treats it as missing and never overwrites the row.
 */
export class GetChatSessions {
  constructor(private readonly sessions: ChatSessionRepository) {}

  /** Switcher listing for one match, newest first. */
  listMetas(matchId: string): ChatSessionMeta[] {
    return this.sessions.listMetas(matchId)
  }

  /** One full session, or null when missing/unreadable. */
  get(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId)
  }
}
