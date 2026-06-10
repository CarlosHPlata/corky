import type { ChatSession, ChatSessionMeta, ChatTurn, ProposalResolution } from '@shared/types'

/**
 * Persists per-match coaching chat sessions (spec 005). Many per match; each
 * row holds its full transcript including embedded ActionProposals. Rows are
 * created lazily by the first upsert (the renderer's draft sessions are not
 * rows). Corrupt stored turns JSON is tolerated and read back as null — a
 * failed load must never let a fresh transcript overwrite a stored one.
 */
export interface ChatSessionRepository {
  /** Listing metas for one match, newest first. */
  listMetas(matchId: string): ChatSessionMeta[]
  /** One full session, or null when missing or unreadable. */
  get(sessionId: string): ChatSession | null
  /** Insert (lazy create, with the given title) or update the transcript.
   * Returns the stored meta. Implementations MUST refuse turn writes that
   * change an already-resolved proposal's resolution — resolutions only move
   * through `resolveProposal`. */
  upsert(sessionId: string, matchId: string, title: string, turns: ChatTurn[]): ChatSessionMeta
  /**
   * Resolve one embedded proposal exactly once, transactionally: asserts the
   * proposal exists and is 'pending', writes the new resolution + resolvedAt.
   * Returns the recorded resolution — which is the PRIOR outcome when the
   * proposal was already resolved (idempotent for double-clicks), or null when
   * the session/proposal does not exist.
   */
  resolveProposal(
    sessionId: string,
    proposalId: string,
    resolution: Exclude<ProposalResolution, 'pending'>,
    at: number
  ): ProposalResolution | null
  /** Escape hatch for ResolveProposal ONLY: when applying an accepted proposal
   * fails midway, the resolution is put back to 'pending' so the card stays
   * actionable. Never exposed over IPC. */
  revertToPending(sessionId: string, proposalId: string): void
}
