import type { ChatTurn } from '@shared/types'
import type { ChatTranscriptRepository } from '../ports/ChatTranscriptRepository'

/**
 * Persists the chat turns for a match's coaching session. Any finalized
 * reflection already stored for the match is preserved (the repo upserts the
 * two halves of the row independently).
 */
export class SaveChatTranscript {
  constructor(private readonly repo: ChatTranscriptRepository) {}

  execute(matchId: string, turns: ChatTurn[]): void {
    this.repo.save(matchId, turns)
  }
}
