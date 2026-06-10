import type Database from 'better-sqlite3'
import type {
  ChatSession,
  ChatSessionMeta,
  ChatTurn,
  ProposalResolution
} from '@shared/types'
import type { ChatSessionRepository } from '../../../application/ports/ChatSessionRepository'

interface Row {
  id: string
  match_id: string
  title: string
  turns_json: string
  created_at: number
  updated_at: number
}

/** Strict parse: corrupt turns JSON reads as null (missing), never as empty —
 * an "empty" read could let a fresh transcript overwrite a stored one. */
function parseTurns(json: string): ChatTurn[] | null {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as ChatTurn[]) : null
  } catch {
    return null
  }
}

function toMeta(row: Row): ChatSessionMeta {
  return {
    id: row.id,
    matchId: row.match_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** Persists coaching chat sessions (spec 005), one row per session. Proposal
 * resolutions only ever move through `resolveProposal` — `upsert` clamps any
 * attempt to change an already-resolved proposal back to its stored state. */
export class SqliteChatSessionRepository implements ChatSessionRepository {
  constructor(private readonly db: Database.Database) {}

  listMetas(matchId: string): ChatSessionMeta[] {
    const rows = this.db
      .prepare(
        'SELECT id, match_id, title, turns_json, created_at, updated_at FROM chat_sessions WHERE match_id = ? ORDER BY created_at DESC, id DESC'
      )
      .all(matchId) as Row[]
    return rows.map(toMeta)
  }

  get(sessionId: string): ChatSession | null {
    const row = this.db
      .prepare('SELECT * FROM chat_sessions WHERE id = ?')
      .get(sessionId) as Row | undefined
    if (!row) return null
    const turns = parseTurns(row.turns_json)
    if (!turns) return null
    return { ...toMeta(row), turns }
  }

  upsert(sessionId: string, matchId: string, title: string, turns: ChatTurn[]): ChatSessionMeta {
    const now = Date.now()
    const write = this.db.transaction((incoming: ChatTurn[]): ChatSessionMeta => {
      const existing = this.db
        .prepare('SELECT * FROM chat_sessions WHERE id = ?')
        .get(sessionId) as Row | undefined

      // Resolutions are owned by resolveProposal: clamp incoming proposals back
      // to the stored resolution wherever the stored one is no longer pending.
      let toStore = incoming
      if (existing) {
        const storedTurns = parseTurns(existing.turns_json) ?? []
        const resolved = new Map(
          storedTurns
            .filter((t) => t.proposal && t.proposal.resolution !== 'pending')
            .map((t) => [t.proposal!.id, t.proposal!])
        )
        toStore = incoming.map((t) => {
          const stored = t.proposal && resolved.get(t.proposal.id)
          return stored ? { ...t, proposal: stored } : t
        })
      }

      this.db
        .prepare(
          `INSERT INTO chat_sessions (id, match_id, title, turns_json, created_at, updated_at)
           VALUES (@id, @matchId, @title, @turns, @now, @now)
           ON CONFLICT(id) DO UPDATE SET turns_json = @turns, updated_at = @now`
        )
        .run({ id: sessionId, matchId, title, turns: JSON.stringify(toStore), now })

      const row = this.db
        .prepare('SELECT * FROM chat_sessions WHERE id = ?')
        .get(sessionId) as Row
      return toMeta(row)
    })
    return write(turns)
  }

  resolveProposal(
    sessionId: string,
    proposalId: string,
    resolution: Exclude<ProposalResolution, 'pending'>,
    at: number
  ): ProposalResolution | null {
    const tx = this.db.transaction((): ProposalResolution | null => {
      const row = this.db
        .prepare('SELECT * FROM chat_sessions WHERE id = ?')
        .get(sessionId) as Row | undefined
      if (!row) return null
      const turns = parseTurns(row.turns_json)
      if (!turns) return null
      const turn = turns.find((t) => t.proposal?.id === proposalId)
      if (!turn?.proposal) return null
      // Exactly-once: a non-pending proposal returns its recorded outcome.
      if (turn.proposal.resolution !== 'pending') return turn.proposal.resolution
      turn.proposal = { ...turn.proposal, resolution, resolvedAt: at }
      this.db
        .prepare('UPDATE chat_sessions SET turns_json = @turns, updated_at = @at WHERE id = @id')
        .run({ id: sessionId, turns: JSON.stringify(turns), at })
      return resolution
    })
    return tx()
  }

  revertToPending(sessionId: string, proposalId: string): void {
    const tx = this.db.transaction((): void => {
      const row = this.db
        .prepare('SELECT * FROM chat_sessions WHERE id = ?')
        .get(sessionId) as Row | undefined
      if (!row) return
      const turns = parseTurns(row.turns_json)
      if (!turns) return
      const turn = turns.find((t) => t.proposal?.id === proposalId)
      if (!turn?.proposal) return
      const { resolvedAt: _drop, ...rest } = turn.proposal
      turn.proposal = { ...rest, resolution: 'pending' }
      this.db
        .prepare('UPDATE chat_sessions SET turns_json = @turns, updated_at = @at WHERE id = @id')
        .run({ id: sessionId, turns: JSON.stringify(turns), at: Date.now() })
    })
    tx()
  }
}
