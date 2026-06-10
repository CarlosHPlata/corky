# Contract: Chat Sessions IPC

## Channels

| Channel | Kind | Use case | Signature (IpcApi) |
|---|---|---|---|
| `chat:sessions:list` | query | `GetChatSessions.listMetas` | `listChatSessions(matchId) → ChatSessionMeta[]` (newest first) |
| `chat:sessions:get` | query | `GetChatSessions.get` | `getChatSession(sessionId) → ChatSession \| null` |
| `chat:sessions:save` | command | `SaveChatSession` | `saveChatSession(matchId, sessionId, turns) → ChatSessionMeta` |
| `coach:chat` | command | `CoachChat` (reworked) | `coachChat(matchId, sessionId, messages) → CoachChatReply` |
| `coach:summarize` | command | `SummarizeIntoReflection` | `summarizeIntoReflection(matchId, sessionId, messages) → CoachChatReply` |

### Retired channels

`chat:transcript:get`, `chat:transcript:save`, `chat:reflection:save`, `coach:reflection:finalize` — removed from `IpcApi`, preload, and `IpcController`. The localStorage legacy-adoption path in the renderer now calls `saveChatSession(matchId, '<matchId>-sess-legacy', turns)` and `saveReflection({ matchId, id: '<matchId>-refl-legacy', ... })`-equivalent create (server accepts the deterministic ids for adoption; see ipc-reflections.md).

## Semantics

**`saveChatSession`** — upsert by `sessionId`; first save creates the row (lazy creation: the renderer only calls this once a player turn exists). Server stamps `title` on create ("Chat · <date>", or "First session" for `-legacy` ids) and `updatedAt` on every save. Turns are persisted verbatim including embedded proposals — but the server rejects (no-op + current row returned) any save that would *change* an already-resolved proposal's resolution (resolution changes go through `proposal:resolve` only).

**`coachChat(matchId, sessionId, messages)`** — sessionId is required but may reference a not-yet-persisted draft (the command does not load the session row; `messages` IS the transcript, exactly as today). Flow: resolve config → discovery (unchanged) → build briefing + `REFLECTIONS` block + proposal-outcome grounding → pending-proposal check (from `messages`) → `chatAgentic` → sanitise raw proposal → return `{ reply, proposalTurn? }`. The renderer appends `proposalTurn ?? plain assistant turn` and persists via `saveChatSession`.

**`summarizeIntoReflection(matchId, sessionId, messages)`** — same return contract as `coachChat`: a `CoachChatReply` whose `proposalTurn` carries a `create_reflection` proposal (forced-tool `summarizeReflectionText`, no loop). Requires ≥1 player turn (server-checked). If a pending proposal exists in `messages`, returns a plain reply asking to settle it first (no proposal minted).

## Context guarantees (FR-018)

Every `coach:chat` / `coach:summarize` call rebuilds server-side, regardless of session: match report (stored JSON) + stored analysis + goal + standing tasks + **all reflections of the match** + semantic memory/history/benchmark via discovery. No transcript content from *other* sessions is included.

## Renderer contract

- `useChatSessions(matchId)`: holds `metas`, `activeSessionId`, `draft` state; "New chat" creates a renderer draft (opener turn only, no row); switcher lists persisted metas + the draft; first send promotes draft → `saveChatSession`.
- `key={sessionId}` on the chat component (replaces `key={matchId}`) — same remount/race guards as spec 004, per session.
- Hydration guard, save-after-hydrate guard, and failed-load-never-overwrites carry over per session.

## Errors

- `coachChat` model failure → reject; renderer shows the existing retry bubble (unchanged).
- `saveChatSession` failure → renderer keeps in-memory turns, next change retries (unchanged pattern).
- `getChatSession` corrupt `turns_json` → `null` (treated as missing; legacy row remains untouched as backup).
