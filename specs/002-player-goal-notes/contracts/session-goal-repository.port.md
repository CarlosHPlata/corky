# Contract: Port — SessionGoalRepository

Driven (secondary) port owned by `application/ports/`, implemented by `adapters/driven/sqlite/SqliteSessionGoalRepository.ts`. Framework-free (Constitution IV).

```ts
import type { SessionGoal, SessionGoalInput } from '@shared/types'

/**
 * Stores the single player's session goal + notes (one global record).
 * Singleton: there is at most one SessionGoal; `save` upserts it.
 */
export interface SessionGoalRepository {
  /** The saved goal, or null when never set. */
  get(): SessionGoal | null
  /** Upsert the (already-normalized) goal; returns the stored record. */
  save(value: SessionGoalInput, updatedAt: number): SessionGoal
}
```

## Semantics

- **`get()`**: reads the singleton row; returns `null` if absent. Never throws on absence.
- **`save(value, updatedAt)`**: upserts row `id = 1` with `value.goal`, `value.notes`, `updatedAt`; returns `{ ...value, updatedAt }`. The caller (`SaveSessionGoal`) passes **already-normalized** text and the timestamp (so `Date.now()` is injected at the use-case boundary, keeping the adapter dumb and testable).
- No `puuid` parameter — single global record (see plan / research Decision 2).

## Adapter test contract (`SqliteSessionGoalRepository.test.ts`)

Mirrors `SqliteSessionAnalysisRepository.test.ts` (in-memory `better-sqlite3`, `runMigrations(db)`):

1. `get()` on a fresh DB → `null`.
2. `save({ goal:'G', notes:'N' }, 123)` then `get()` → `{ goal:'G', notes:'N', updatedAt:123 }`.
3. A second `save(...)` updates in place (still one row) and reflects the new values + timestamp.
4. `save({ goal:'', notes:'' }, 456)` then `get()` → `{ goal:'', notes:'', updatedAt:456 }` (cleared, row present).
