# Phase 1 Data Model: Agentic Coach Chat

All DTOs live in `src/shared/types.ts` unless noted. Domain-only shapes live in `src/main/domain/`.

---

## New entities

### Reflection

```ts
export type ReflectionSource = 'player' | 'coach'

export interface Reflection {
  id: string                 // `${matchId}-refl-${now36}-${i}` | `${matchId}-refl-legacy`
  matchId: string
  text: string               // trimmed, capped (2000 chars, server-enforced)
  refs: EvidenceRef[]        // 0..n; validated against anchor catalog ∪ standing set at save
  source: ReflectionSource
  createdAt: number
  updatedAt: number
}
```

**Validation**: non-empty text after trim; refs with unknown ids dropped at save (silent, consistent with chat refs); cap 20 reflections per match (server-enforced, oldest are NOT auto-deleted — save fails with a friendly error; UI hides composer at cap).

### ChatSession / ChatSessionMeta

```ts
export interface ChatSessionMeta {
  id: string                 // `${matchId}-sess-${now36}` | `${matchId}-sess-legacy`
  matchId: string
  title: string              // "Chat · Jun 10, 19:42" | "First session" (legacy)
  createdAt: number
  updatedAt: number
}

export interface ChatSession extends ChatSessionMeta {
  turns: ChatTurn[]          // includes embedded proposals
}
```

**Lifecycle**: created lazily on first persisted player turn (renderer drafts are not rows). Never auto-deleted. A session belongs to exactly one match.

### ActionProposal (embedded in ChatTurn)

```ts
export type ProposalResolution = 'pending' | 'accepted' | 'rejected' | 'stale'

export type ProposalPayload =
  | { kind: 'update_tasks'
      set: StandingFocusTask[]        // the FULL resulting set (1–3), already validated
      retireIds: string[]             // explicit retires (subset of current set ids)
      baseline: string }              // sorted signature of standing set at proposal time
  | { kind: 'create_reflection'
      text: string
      refs: EvidenceRef[] }
  | { kind: 'update_reflection'
      reflectionId: string
      text: string
      refs: EvidenceRef[]
      baseline: number }              // target reflection's updatedAt at proposal time
  | { kind: 'delete_reflection'
      reflectionId: string
      baseline: number }

export interface ActionProposal {
  id: string                          // `${sessionId}-prop-${now36}`
  payload: ProposalPayload
  resolution: ProposalResolution
  resolvedAt?: number
}
```

**Invariants**:
- At most one `pending` proposal per session (enforced in `CoachChat` before minting).
- `resolution` transitions exactly once: `pending → accepted | rejected | stale`. Enforced transactionally in the session repository; subsequent resolve calls return the recorded outcome unchanged.
- Payloads are persisted **post-sanitisation only** — a stored proposal is always acceptable modulo staleness.

### ChatTurn (extended)

```ts
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  refs?: EvidenceRef[]                // existing
  proposal?: ActionProposal           // NEW — assistant turns only
}
```

### EvidenceRef (extended)

```ts
export interface EvidenceRef {
  id: string                          // existing grammars + NEW `task:<standingTaskId>`
  kind: 'stat' | 'marker' | 'benchmark' | 'note' | 'task'   // NEW 'task'
  label?: string
}
```

`task:` refs resolve against the standing set (active **and** retired rows still present), not the anchor catalog. Unknown → silently dropped.

---

## Reworked DTOs

### CoachChatReply (reworked)

```ts
export interface CoachChatReply {
  reply: string
  /** Present when the loop minted a (sanitised, pending) proposal this turn.
   *  The renderer appends `proposalTurn` instead of building its own assistant turn. */
  proposalTurn?: ChatTurn             // role:'assistant', text:reply, proposal:{...pending}
}
```

### ResolveProposalInput / ResolveProposalOutcome (new)

```ts
export interface ResolveProposalInput {
  matchId: string
  sessionId: string
  proposalId: string
  decision: 'accept' | 'reject'
}

export interface ResolveProposalOutcome {
  resolution: ProposalResolution      // 'accepted' | 'rejected' | 'stale' (never 'pending')
  /** Patched stored analysis when a task accept changed the Next-game focus (same
   *  contract as the old ReflectionOutcome.analysis); null otherwise. */
  analysis: MatchAnalysis | null
  /** The saved/updated reflection on reflection accepts; null otherwise. */
  reflection: Reflection | null
}
```

### SaveReflectionInput (new)

```ts
export interface SaveReflectionInput {
  matchId: string
  id?: string                         // absent = create, present = edit (player-owned edits)
  text: string
  refs: EvidenceRef[]
}
```

### Removed

- `ReflectionOutcome` (replaced by `ResolveProposalOutcome`).
- IPC DTO shape `{ turns, reflection }` of `getChatTranscript` (replaced by `ChatSession`).

---

## Domain shapes (not in shared/)

`src/main/domain/chat/proposal.ts`:

```ts
/** Raw tool payloads as the model emits them (pre-sanitisation). */
interface RawTaskProposal { set: GeneratedTask[]; retire: string[] }
interface RawReflectionProposal { text: string; refIds: string[]; reflectionId?: string }

sanitizeTaskProposal(raw, standing, metricKeys, matchId, now)  → { set, retireIds } | null
sanitizeReflectionProposal(raw, validRefIds, reflections)      → payload | null
standingBaseline(standing)                                     → string   // sorted shape signature
isTaskProposalStale(payload, currentStanding)                  → boolean
isReflectionProposalStale(payload, currentReflection)          → boolean
```

All pure; `null` means "suppress — degrade to plain reply".

`MatchCoachingModel` port additions:

```ts
interface AgenticChatExtras {
  standing: StandingFocusTask[]
  catalogMetricKeys: MetricKey[]
  reflections: { id: string; source: ReflectionSource; text: string }[]  // compact projection
  validRefIds: Set<string>            // anchor catalog ∪ task:<id> grammar (built by command)
}

chatAgentic(briefing, history, extras: AgenticChatExtras, model)
  → { reply: string; rawProposal?: RawTaskProposal | RawReflectionProposal & {kind}; }

distillMemory(briefing, history, existingMemory, model)
  → ProposedSemanticObject[]          // replaces the memory third of summarizeReflection

summarizeReflectionText(briefing, history, model)
  → { text: string; refIds: string[] }  // forced-tool, for SummarizeIntoReflection
```

`summarizeReflection` (the old three-in-one) is **removed** with `FinalizeReflection`.

---

## SQLite schema additions & migration

```sql
-- Player/coach takeaways per match; many per match; refs are report anchors or task ids.
CREATE TABLE IF NOT EXISTS reflections (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL,
  text       TEXT NOT NULL,
  refs_json  TEXT NOT NULL,
  source     TEXT NOT NULL,            -- 'player' | 'coach'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reflections_match ON reflections (match_id, created_at);

-- Coaching chat sessions; many per match; turns_json embeds proposals + resolutions.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  turns_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_match ON chat_sessions (match_id, created_at);

-- Idempotent legacy adoption (runs every startup; OR IGNORE makes re-runs no-ops).
INSERT OR IGNORE INTO chat_sessions (id, match_id, title, turns_json, created_at, updated_at)
  SELECT match_id || '-sess-legacy', match_id, 'First session', json, updated_at, updated_at
  FROM chat_transcripts WHERE json IS NOT NULL AND json != '[]';

INSERT OR IGNORE INTO reflections (id, match_id, text, refs_json, source, created_at, updated_at)
  SELECT match_id || '-refl-legacy', match_id, reflection, '[]', 'coach', updated_at, updated_at
  FROM chat_transcripts WHERE reflection IS NOT NULL AND trim(reflection) != '';
```

`chat_transcripts` is retained (migration source; safety) but no feature code reads or writes it after this change. The spec-004 renderer localStorage adoption now targets the new channels and produces the same deterministic `-legacy` ids, so it composes with this migration idempotently.

**Unchanged tables**: `standing_focus_tasks`, `task_evaluations`, `match_analyses`, `semantic_objects(_fts)`, `coaching_config`, all spec-001/002/003 tables.

---

## State transitions

```
ActionProposal:   pending ──accept──▶ accepted        (apply succeeded)
                  pending ──accept──▶ stale           (baseline mismatch; nothing applied)
                  pending ──reject──▶ rejected
                  accepted/rejected/stale ──▶ ∅       (terminal; further resolves return recorded outcome)

Reflection:       created (player|coach) ⇄ edited ──▶ deleted (hard delete)
ChatSession:      draft (renderer-only) ──first player turn──▶ persisted ──▶ updated per turn
StandingFocusTask: unchanged shape; mutation paths now = analysis pass 4 | accepted update_tasks proposal
```
