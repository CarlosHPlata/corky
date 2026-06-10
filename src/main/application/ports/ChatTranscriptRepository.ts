import type { ChatTurn } from '@shared/types'

/** The stored coaching session for one match: the chat turns plus the
 * finalized reflection (null until the player has finalized one). */
export interface ChatTranscript {
  turns: ChatTurn[]
  reflection: string | null
}

/**
 * Persists per-match coaching-session transcripts (the chat with Corky and the
 * finalized reflection). The two halves write independently: `save` preserves
 * an existing reflection, `saveReflection` preserves existing turns. Corrupt
 * stored JSON is tolerated and read back as empty turns — never thrown.
 */
export interface ChatTranscriptRepository {
  /** The stored session for a match, or null when nothing was ever saved. */
  get(matchId: string): ChatTranscript | null
  /** Upsert the chat turns; leaves any saved reflection untouched. */
  save(matchId: string, turns: ChatTurn[]): void
  /** Upsert the finalized reflection; leaves any saved turns untouched. */
  saveReflection(matchId: string, reflection: string): void
}
