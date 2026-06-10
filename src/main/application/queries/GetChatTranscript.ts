import type {
  ChatTranscript,
  ChatTranscriptRepository
} from '../ports/ChatTranscriptRepository'

/**
 * Reads the stored coaching session for a match (turns + finalized reflection),
 * or null when no session was ever saved. Read-only — the renderer calls this
 * when the chat opens to restore the conversation after app restart.
 */
export class GetChatTranscript {
  constructor(private readonly repo: ChatTranscriptRepository) {}

  execute(matchId: string): ChatTranscript | null {
    return this.repo.get(matchId)
  }
}
