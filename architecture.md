# Corky — Agentic Coaching Architecture

This document describes the agentic coaching platform built on top of the existing
Corky match-analysis shell. The work was delivered in three epics (A, B, C) in a
single session on 2026-06-10.

---

## Overview

Corky evolved from a static four-pass match analyser into a feedback loop:

```
Analyse game → Coach chat → Finalize reflection → Semantic memory
        ↑                                                  ↓
        └────────────── Standing focus tasks ──────────────┘
```

The app is a Windows-only Electron desktop app. All AI calls go to the Anthropic
API. All persistence is SQLite via better-sqlite3 (sync, main-process only).
The renderer never holds secrets; context is rebuilt in the main process per call.

---

## Architectural constraints (unchanged)

- **Hexagonal (ports & adapters)**: `domain/` and `application/` never import
  Electron or any adapter SDK. All I/O crosses a port interface.
- **CQRS**: commands mutate state, queries read it. No event sourcing.
- **Electron IPC boundary**: renderer↔main via a typed `IpcApi` interface
  (`src/shared/types.ts`). Preload exposes only the allowed channels.
- **Constitution VI**: secrets (API keys, PUUID) never cross the preload bridge.

---

## Epic A — Platform core

### A1 · Semantic Object Memory (SOM)

**What it is.** A typed, structured memory store for coaching facts that persist
across games. Four kinds: `pattern`, `weakness`, `strength`, `milestone`.

**Why SQLite + FTS5 (no vector DB).** For a single-user desktop holding a few
hundred objects, structured filters plus FTS5 full-text search are sufficient.
Brute-force cosine similarity is an optional future rung if ever needed.

**Key files.**

| File | Role |
|---|---|
| `src/main/domain/memory/semanticObject.ts` | Domain types + `mergeSemanticObjects()` pure fn |
| `src/main/application/ports/SemanticMemory.ts` | Port: `upsert`, `query`, `setStatus` |
| `src/main/adapters/driven/sqlite/SqliteSemanticMemory.ts` | Adapter: ON CONFLICT DO UPDATE in transaction, optional FTS MATCH |
| `src/main/adapters/driven/sqlite/schema.ts` | `semantic_objects` table + FTS5 virtual table + sync triggers |

**Subject-key deduplication.** `subjectKey(obj)` builds a canonical string from
`kind|phase|champion|role|metric` (lowercased). A proposed object matches an
existing one when their subject keys are equal and the existing status is not
`resolved`. Resolved objects never get refreshed — a new one is minted instead.

**Id minting.** Collision-proof: `${sourceMatchId}-mem-${now.toString(36)}-${index}`.
The timestamp segment prevents duplicate ids when the user re-finalizes the same
match.

**Evidence cap.** An existing object's `evidenceMatchIds` is capped at 10, newest
appended, deduped so the source match is never listed twice.

---

### A2 · Context block registry

**What it is.** A registry of composable context blocks that feed the coaching
models. Each block has a token estimate and can be enabled/disabled independently.

**Key files.**

| File | Role |
|---|---|
| `src/main/domain/report/contextBlocks.ts` | `CONTEXT_BLOCKS` registry + `renderContextBlocks()` |
| `src/shared/config.ts` | `ContextBlockInfo` type, surfaced to the renderer |

**Blocks.**

| Id | Group | Always on | Typical tokens | Requires |
|---|---|---|---|---|
| `match.game` | match | ✓ | — | — |
| `match.core` | match | ✓ | — | — |
| `match.stats` | match | | ~80 | — |
| `match.markers` | match | | ~120 | — |
| `match.benchmark` | match | | ~40 | `opgg-mcp` |
| `player.goal` | intent | | ~30 | — |
| `player.reflection` | intent | | ~40 | — |
| `carry.framing` | carry | | ~60 | — |
| `carry.narration` | carry | | ~80 | — |

`renderContextBlocks(report, catalog, extras, enabledIds?)` accepts an optional
`enabledIds` set; `alwaysOn` blocks render regardless. When `enabledIds` is
omitted all blocks render (backward-compat).

---

### A3 · Deterministic history / cohort aggregates

**What it is.** Per-champion/matchup/role/overall win-rate and stat averages
computed from locally stored match summaries.

**Key file.** `src/main/domain/history/cohortAggregates.ts`

- `resolveCohort()` — matchup → champion → role → overall fallback (minSample=3).
- `computeCohortAggregates()` — wins-preferred averaging over the resolved cohort.
- `renderHistoryBlock()` — compact `HIST` line for the discovery dossier.

---

### A4 · Discovery agent (agentic chat)

**Shape.** Deterministic `plan → parallel-fetch → respond`, NOT a free tool loop.
Cost is bounded: one planning call (max 300 tokens) + N parallel fetches + one
response call.

**Flow inside `CoachChat.execute()`.**

```
1. resolveConfig()                   — load budget tier + enabled sources
2. eco tier? → skip discovery        — chat still works, just from base context
3. Build inventory string            — enumerate available sources + stored data
4. planDiscovery(question, inventory)→ DiscoveryPlan: { fetches: FetchSpec[] }
5. parallel fetches (each try/catch) — each failure is silently skipped
6. DOSSIER block appended to ctx     — only when at least one fetch returned data
7. groundRefs() from AnchorCatalog   — evidence refs resolved to fact lines
8. model.chat(ctx, messages)         → CoachChatReply
```

**Key files.**

| File | Role |
|---|---|
| `src/main/application/commands/CoachChat.ts` | Command orchestrator |
| `src/main/adapters/driven/anthropic/matchPrompts.ts` | `SUBMIT_PLAN`, `buildDiscoveryPrompt`, `parseDiscoveryPlan` |
| `src/main/adapters/driven/anthropic/AnthropicMatchCoachingModel.ts` | `planDiscovery()` via `callTool` pattern |

---

### A5 · Memory distillation (FinalizeReflection)

**What it is.** When the player ends the post-game chat, Corky writes a
first-person reflection and may update both the standing focus-task set and the
semantic memory store.

**Flow inside `FinalizeReflection.execute()`.**

```
1. Query memory: active/confirmed objects for this player
2. Call model.summarizeReflection(transcript, analysis, { existingMemory })
   → ReflectionProposal: { reflection, tasks, memory[] }
3. mergeSemanticObjects(proposal.memory, existing, matchId, now) → touched rows
4. semanticMemory.upsert(puuid, touchedRows)
5. Apply task set/retire changes (same logic as AnalyzeMatch pass 4)
6. saveChatTranscript: persist turns + reflection to SQLite
```

The model receives a compact projection of existing memory so it can refresh
known patterns rather than minting duplicates.

---

### A6 · Progress tracking

**What it is.** A zero-LLM summary of the coaching loop's health, shown on the
Home screen.

**Key files.**

| File | Role |
|---|---|
| `src/main/application/queries/GetProgress.ts` | Builds `ProgressSummary` from stored data |
| `src/renderer/src/data/useProgress.ts` | React hook |
| `src/renderer/src/screens/Home.tsx` | `FocusCard` renders tasks + working-on + wins |

**`ProgressSummary` shape.**

```ts
interface ProgressSummary {
  tasks: TaskProgress[]       // standing tasks + last 5 evals + streak
  working: { statement; occurrences }[]   // active patterns/weaknesses, cap 4
  wins: { statement; kind }[]             // resolved objects + milestones, cap 4
  analysedGames: number                   // total match_analyses rows
}
```

**Streak.** Consecutive most-recent `improved` or `held` evaluations from the
newest end of a task's evaluation history.

---

## Epic B — Configuration

### B1 · Data source registry

**Key file.** `src/main/domain/config/sourceRegistry.ts`

| Id | Kind | Default | Locked |
|---|---|---|---|
| `opgg-mcp` | mcp | on | — |
| `riot-match-v5` | riot-api | on | sync |
| `riot-league-v4` | riot-api | on | sync |
| `riot-agent-lookups` | riot-api | off | — |
| `local-som` | local | on | — |
| `local-history` | local | on | — |

`lockedReason` is set on the two Riot sync sources; the UI shows the lock note
and the resolver always forces them on.

---

### B2 · Prompt architecture

**Split.** Each coaching pass has two layers:

1. **Locked scaffold** (in `matchPrompts.ts`): output contracts — forced-tool
   discipline, anchor citation rules, JSON shape, never-invent-numbers, length
   caps. Users cannot edit this.
2. **Editable coaching-instructions layer** (in `promptRegistry.ts`): persona,
   tone, bluntness, focus. Users can override this per pass.

**Stale-default detection.** When the user saves an override, its `baseHash`
(djb2 hex of the default text at save time) is stored alongside it. If the
hardcoded default later changes, `staleDefault: true` is surfaced in
`PromptInfo` so the UI can warn the user.

**Persist as diff.** `CoachingConfigOverrides` stores only non-default values.
Restoring defaults = deleting the overrides row. Unknown ids in stored overrides
are silently dropped on resolve, so stale registry entries never break anything.

**Key files.**

| File | Role |
|---|---|
| `src/main/domain/config/promptRegistry.ts` | `PROMPT_REGISTRY` (7 passes) + `hashText()` |
| `src/main/domain/config/coachingConfig.ts` | `resolveConfig()`, `diffOverrides()`, `isEmptyOverrides()` |
| `src/main/adapters/driven/sqlite/SqliteCoachingConfigRepository.ts` | Single-row upsert for `coaching_config` |
| `src/shared/config.ts` | `ResolvedCoachingConfig`, `SaveCoachingConfigInput`, `CoachingConfigOverrides` |

---

### B3 · Settings screen

Three cards on the Settings screen let users configure the coaching platform
without touching code.

**DataSourcesCard** — grouped by kind (MCP / Riot API / Local); locked sources
show the lock note and a disabled toggle.

**ContextBlocksCard** — grouped by `block.group`; shows token chips; dims blocks
whose required source is disabled; TierSegment for the budget tier.

**CoachPromptsCard** — per-pass expand/collapse; textarea with onBlur commit;
`edited` / `default updated` badges; per-prompt restore button. Global "Restore
all defaults" button (enabled when `config.modified`).

**Save-race prevention.** `useCoachingConfig` maintains a `desired` ref mirror
that every mutation updates synchronously before the async save. Rapid UI
interactions (e.g. prompt textarea blur + source toggle) both build from
`desired.current`, so the second save never silently undoes the first.

---

## Epic C — Touchable report

### C1 · Evidence references

**What it is.** Clicking a stat chip, timeline marker, or benchmark badge in the
match report attaches it as an `EvidenceRef` to the next chat message, giving the
coach factual grounding for the question.

**Flow.**

```
Renderer: user clicks element → AskBadge/Askable → ChatComposer ref list
IPC: coachChat(matchId, messages)    — turns carry refs?: EvidenceRef[]
Main: resolveChatRefs(refs, catalog) — each ref id looked up in AnchorCatalog
                                     — missing/invalid ids silently dropped
                                     — valid refs rendered as [ANCHOR ...] lines
                                     — appended to context before model call
```

**Key files.**

| File | Role |
|---|---|
| `src/main/domain/report/anchorCatalog.ts` | `buildAnchorCatalog()`, `isValidStructuredRef()` |
| `src/renderer/src/components/coaching/AskRef.tsx` | `AskBadge` hover chip, `Askable` right-click wrapper |
| `src/shared/types.ts` | `EvidenceRef`, `ChatTurn.refs?` |

---

### C2 · Chat transcript persistence

**Why.** Chat turns (including evidence refs) and the finalized reflection were
previously held in `localStorage`. Moving them to SQLite gives them the same
durability as match data, enables future cross-session queries, and removes the
per-origin localStorage size cap.

**Migration.** On first load the renderer checks `localStorage` for legacy keys.
Each key (turns + reflection) is adopted independently: the value is read,
written to SQLite via IPC, and removed from `localStorage` only on success.

**Key files.**

| File | Role |
|---|---|
| `src/main/adapters/driven/sqlite/SqliteChatTranscriptRepository.ts` | Stores `ChatTurn[]` + reflection per matchId |
| `src/main/application/commands/SaveChatTranscript.ts` | Command: upsert turns (preserve reflection) |
| `src/main/application/queries/GetChatTranscript.ts` | Query: load turns + reflection |
| `src/main/adapters/driven/sqlite/schema.ts` | `chat_transcripts` table |

**Renderer safety guards.**

- `key={matchId}` on `<CoachChat>` — remounts on match change, drops in-flight
  continuations.
- `hydratedFor.current !== matchId` guard inside send/finalize continuations —
  replies from a previous match can't land in the current one.
- Early return on transcript-load failure — a failed load never overwrites a
  stored transcript.

---

## Data flow diagram

```
Renderer (React)
  │  IPC (preload bridge)
  ▼
IpcController            ──► AnalyzeMatch ──► AnthropicMatchCoachingModel
  │                               │                     (4 passes: framing/narration/review/tasks)
  │                               ├──► renderContextBlocks(enabledIds)
  │                               ├──► resolveBenchmark (OpggBenchmarkDataSource)
  │                               └──► mergeStanding → SqliteReportRepository
  │
  ├──► CoachChat          ──► planDiscovery (light model)
  │         │             ──► parallel fetches (per-source adapters)
  │         │             ──► groundRefs (AnchorCatalog)
  │         └──► model.chat (light model)
  │
  ├──► FinalizeReflection ──► model.summarizeReflection (light model)
  │         │             ──► mergeSemanticObjects → SqliteSemanticMemory
  │         └──► mergeStanding → SqliteReportRepository
  │
  └──► GetProgress        ──► SqliteReportRepository (evals + tasks)
                          ──► SqliteSemanticMemory (working-on + wins)
```

---

## SQLite schema additions

```sql
-- Coaching facts that persist across games
CREATE TABLE semantic_objects (
  id TEXT PRIMARY KEY,
  puuid TEXT NOT NULL,
  kind TEXT NOT NULL,          -- pattern|weakness|strength|milestone
  phase TEXT,
  champion TEXT,
  role TEXT,
  metric TEXT,
  statement TEXT NOT NULL,
  evidence_match_ids TEXT NOT NULL,   -- JSON array, max 10
  occurrences INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

-- FTS5 virtual table over statement (full-text search)
CREATE VIRTUAL TABLE semantic_objects_fts USING fts5(
  statement, content='semantic_objects', content_rowid='rowid'
);

-- Single-row coaching config (overrides diff)
CREATE TABLE coaching_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  overrides_json TEXT NOT NULL
);

-- Chat turns + reflection per match
CREATE TABLE chat_transcripts (
  match_id TEXT PRIMARY KEY,
  turns_json TEXT NOT NULL,
  reflection TEXT
);
```

---

## Model tier policy

| Use case | Tier | Reason |
|---|---|---|
| AnalyzeMatch pass 1 (framing) | light | Decorative; fast |
| AnalyzeMatch pass 2 (narration) | light | Factual annotation; fast |
| AnalyzeMatch pass 3 (review) | heavy | Prose verdict; needs depth |
| AnalyzeMatch pass 4 (tasks) | heavy | Sustained-set reasoning |
| CoachChat planning (discovery) | light | max 300 tokens |
| CoachChat response | light | Conversational; frequent |
| FinalizeReflection | light | Closing step; fast |
| Session/quick analysis | configurable | Pre-existing feature |

---

## Key invariants

- **No free tool loops.** The discovery agent runs a single planning call then
  parallel fetches — bounded, predictable cost.
- **Deterministic evals before the model.** Task evaluations (since-last loop)
  are computed from the metric registry before the model is called. A model
  failure in pass 4 still surfaces the correct since-last read.
- **Partial over failure.** Each analysis pass is individually guarded; a single
  failure yields `status: 'error'` for that section and `status: 'partial'` for
  the overall analysis rather than sinking the whole run.
- **Overrides-only persistence.** `CoachingConfigOverrides` stores only
  deviations from defaults. Restoring defaults is a single-row delete.
- **Collision-proof ids.** Semantic-object and standing-task ids include a
  timestamp component so re-running the same match never collides with previously
  minted ids.
- **Desired-state ref mirror.** `useCoachingConfig` applies every mutation to
  `desired.current` synchronously before the async IPC save, preventing rapid
  UI interactions from overwriting each other.
