# Phase 1 Data Model: Session Goal & Notes

## Entity: SessionGoal

The player's current self-set focus for their climb. Exactly one exists for the single player (singleton). Editing replaces it.

| Field       | Type             | Notes                                                              |
|-------------|------------------|-------------------------------------------------------------------|
| `goal`      | `string`         | Short single statement. Trimmed. ≤ 200 chars. `''` when unset.     |
| `notes`     | `string`         | Free-form, multi-line. Trimmed. ≤ 1000 chars. `''` when unset.     |
| `updatedAt` | `number \| null` | Epoch ms of last save; `null` when never set (default/empty).      |

**DTO (in `src/shared/types.ts`)**

```ts
/** The player's session goal + notes, fed to the coach as stated intent. */
export interface SessionGoal {
  goal: string
  notes: string
  updatedAt: number | null
}

/** What the renderer submits when saving (server trims + caps). */
export interface SessionGoalInput {
  goal: string
  notes: string
}
```

### Derived / behaviour

- **`hasContent(goal)`** — `true` when `goal.trim()` or `notes.trim()` is non-empty. Drives empty-state vs. read-mode in the UI and the presence of the prompt intent block.
- **Notes are line-oriented in read mode**: each non-blank line of `notes` renders as its own item (split on `\n`, trim, drop empties). Storage keeps the raw multi-line string; the split is a render/derivation concern.

## Validation rules (pure — `domain/sessionGoal.ts`)

`normalizeSessionGoal(input: SessionGoalInput): SessionGoalInput`

1. `goal` → `trim()`, then cap to 200 chars.
2. `notes` → `trim()` (outer), then cap to 1000 chars. Interior blank lines are preserved in storage; they are dropped only at render time.
3. Whitespace-only input for a field → `''` (treated as unset).
4. Result with both fields `''` is valid and represents "cleared" (returns the UI to the empty state).

`hasContent(value: { goal: string; notes: string }): boolean` — as above.

> Caps come from spec FR-012 / Edge Cases (goal ≤ 200, notes ≤ 1000). The renderer mirrors these as `maxLength` for immediate feedback, but the domain function is authoritative.

## Persistence (SQLite)

New singleton table (migration appended to `schema.ts`, idempotent like the rest):

```sql
CREATE TABLE IF NOT EXISTS session_goal (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  goal       TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  updated_at INTEGER
);
```

- **Write**: `INSERT INTO session_goal (id, goal, notes, updated_at) VALUES (1, @goal, @notes, @updatedAt) ON CONFLICT(id) DO UPDATE SET goal=@goal, notes=@notes, updated_at=@updatedAt`.
- **Read**: `SELECT goal, notes, updated_at FROM session_goal WHERE id = 1` → maps to `SessionGoal`; missing row → `null` (renderer shows empty state).
- Single row, enforced by `CHECK (id = 1)`. No `puuid` key (see research Decision 2) — available before account sync.

## State transitions (UI)

```
            (no row / both empty)
                   │
            ┌──────▼──────┐   "Set a goal" / "Edit"
            │  EMPTY      │ ─────────────►  EDIT  ──── Save (normalize+persist) ──► READ
            └─────────────┘                  │  ▲                                    │
                   ▲                   Cancel│  └──────────  "Edit"  ◄───────────────┘
                   │                         ▼
                   └──────────  Save with both fields empty ──────────────────────────┘
```

- **EMPTY → EDIT**: via the empty-state CTA.
- **READ → EDIT**: via the Edit button.
- **EDIT → READ**: Save (⌘/Ctrl+Enter or button) → `SaveSessionGoal` → persisted, normalized text shown.
- **EDIT → previous**: Cancel (Esc or button) → draft discarded, last saved text restored.
- **EDIT → EMPTY**: Save with both fields blank → cleared.

## Relationships

- **SessionGoal → AnalyzeSession (consumer)**: `AnalyzeSession` reads the current `SessionGoal` via `SessionGoalRepository` and, when `hasContent`, passes `{ goal, notes }` as `playerContext` to `SessionCoachingModel.analyzeSession`. No persisted link; it's read at analysis time so the latest text is always used (FR-013).
- No relationship to `account`, `matches`, or `session_analyses` tables — the goal is independent, single-row player state.
