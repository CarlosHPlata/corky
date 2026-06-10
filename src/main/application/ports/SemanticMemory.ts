import type {
  SemanticObject,
  SemanticObjectKind,
  SemanticObjectStatus
} from '../../domain/memory/semanticObject'

export interface SemanticMemoryFilter {
  puuid: string
  kinds?: SemanticObjectKind[]
  champion?: string
  role?: string
  phase?: string
  metric?: string
  statuses?: SemanticObjectStatus[]
  /** Free-text search over statements (FTS in the sqlite adapter). */
  text?: string
  limit?: number
}

/**
 * Stores the player's Semantic Object Memory — typed coaching facts accumulated
 * across analysed games, keyed by puuid. `upsert` writes the rows returned by
 * mergeSemanticObjects; `query` is the coach's recall, most-established first.
 */
export interface SemanticMemory {
  /** Insert or replace the given objects for this player. */
  upsert(puuid: string, objects: SemanticObject[]): void
  /** Objects matching the filter, ordered by occurrences then recency. */
  query(filter: SemanticMemoryFilter): SemanticObject[]
  /** Move the given objects to a new lifecycle status, stamping `at`. */
  setStatus(ids: string[], status: SemanticObjectStatus, at: number): void
}
