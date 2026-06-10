# Tasks: Agentic Coach Chat

**Input**: Design documents from `/specs/005-agentic-coach-chat/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — Constitution V (test-first with fixtures) mandates Vitest coverage for every `domain/`/`application` unit and adapter validator touched here. SQLite repo/migration tests carry the known ABI caveat.

**Ordering inside each story**: Constitution VIII (frontend-first) — stub UI → review gate → domain+tests → adapter → command → IPC wire. Backend wiring must not change UI layout or data shape.

**Organization**: Tasks grouped by user story (US1–US5 from spec.md) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (shared DTOs & stubs)

**Purpose**: Additive shared-type groundwork every story builds on. Nothing is removed yet — the app keeps compiling and running on the 004 flow throughout.

- [X] T001 Add new DTOs to src/shared/types.ts — `Reflection`/`ReflectionSource`, `ChatSessionMeta`/`ChatSession`, `ProposalPayload`/`ActionProposal`/`ProposalResolution`, `ChatTurn.proposal?`, `EvidenceRef.kind` + `'task'`, `SaveReflectionInput`, `ResolveProposalInput`/`ResolveProposalOutcome`, `CoachChatReply.proposalTurn?` (per data-model.md; keep `ReflectionOutcome` and legacy channel types alive until T031)
- [X] T002 [P] Create stub src/renderer/src/stubs/chatSessions.ts — two sessions for one match; turns covering plain chat, pending task proposal, accepted task proposal, rejected reflection proposal, stale task proposal (Constitution VIII)
- [X] T003 [P] Create stub src/renderer/src/stubs/reflections.ts — empty / player-only / mixed player+coach with refs / at-cap states (Constitution VIII)

---

## Phase 2: Foundational (storage substrate)

**Purpose**: Tables, migration, repositories, and the session persistence channels every story writes through. New channels land **alongside** the legacy ones; retirement happens in US3/US5.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `reflections` + `chat_sessions` tables, indexes, and the idempotent `INSERT OR IGNORE` legacy migration from `chat_transcripts` to src/main/adapters/driven/sqlite/schema.ts (exact SQL in data-model.md)
- [X] T005 [P] Create port src/main/application/ports/ReflectionRepository.ts (`list/get/upsert/delete/countForMatch`) and adapter src/main/adapters/driven/sqlite/SqliteReflectionRepository.ts
- [X] T006 [P] Create port src/main/application/ports/ChatSessionRepository.ts (`listMetas/get/upsert/resolveProposal`) and adapter src/main/adapters/driven/sqlite/SqliteChatSessionRepository.ts — `resolveProposal` transactional, asserts pending, exactly-once (research R7)
- [X] T007 Add migration idempotency test test/unit/schemaMigration.test.ts — legacy row → first session + first reflection; run migration twice → no duplicates; empty/corrupt legacy rows skipped (ABI caveat applies)
- [X] T008 Add query src/main/application/queries/GetChatSessions.ts + command src/main/application/commands/SaveChatSession.ts (lazy create, server-stamped title, reject resolution changes via save — contracts/ipc-chat-sessions.md); wire IPC `chat:sessions:list|get|save` in src/main/adapters/driving/IpcController.ts, src/preload/index.ts, src/main/infrastructure/container.ts

**Checkpoint**: Storage + session persistence ready — user stories can begin.

---

## Phase 3: User Story 1 — Negotiate next-game tasks in chat (Priority: P1) 🎯 MVP

**Goal**: The chat interprets task-change intent, emits a confirm-first proposal card with the full resulting task set; Accept persists and re-renders everywhere, Reject informs the coach, stale/double accepts are safe.

**Independent Test**: Open an analysed match, ask to change a task, accept the card → standing set changes on report + Home and survives restart (quickstart steps 1–5, 11).

### Frontend first (Constitution VIII)

- [X] T009 [P] [US1] Create src/renderer/src/components/coaching/ProposalCard.tsx — pending/accepted/rejected/stale states; task variant renders full resulting set as `FocusTask` rows + "retiring: …" line; reflection variant renders text + `EvidenceChip` refs (contracts/ipc-resolve-proposal.md renderer contract)
- [X] T010 [US1] Rework src/renderer/src/components/CoachChat.tsx against stubs/chatSessions.ts — render `turn.proposal` cards in thread, task-negotiation opener + starters, Accept/Reject handlers (stub-resolved). **Review gate: walk all five stub states and sign off before T011+**

### Backend

- [X] T011 [P] [US1] Create src/main/domain/chat/proposal.ts (`sanitizeTaskProposal`, `sanitizeReflectionProposal`, `standingBaseline`, `isTaskProposalStale`, `isReflectionProposalStale` — pure, research R9) + test test/unit/proposal.test.ts (>3 tasks, non-computable metric, empty-by-omission, unknown ref dropped, unknown update/delete target suppressed, baseline/stale, identical-set suppressed)
- [X] T012 [P] [US1] Extend src/main/adapters/driven/anthropic/matchPrompts.ts — four propose-tool schemas + payload validators + agentic system scaffold (task-settling steer, full-resulting-set discipline, anchor rules) + `chat.agentic` entry in src/main/domain/config/promptRegistry.ts; extend test/unit/matchPrompts.test.ts (canned valid/malformed payloads)
- [X] T013 [US1] Implement `chatAgentic` bounded tool loop in src/main/adapters/driven/anthropic/AnthropicMatchCoachingModel.ts — `tool_choice: auto`, cap 3 rounds, synthetic tool_results, last-valid-wins, pending-blocks-new, text-fallback degradation (contracts/agentic-chat-tools.md); extend adapter test with fake `CreateMessage` (0 tools / 1 proposal / 2 proposals last-wins / cap at 3 / malformed / pending-exists)
- [X] T014 [US1] Rework src/main/application/commands/CoachChat.ts — signature `execute(matchId, sessionId, messages)`; keep discovery; add REFLECTIONS context block + resolved-proposal outcome grounding (research R10); pending-proposal check from messages; call `chatAgentic`; sanitise via domain/chat/proposal.ts; mint `proposalTurn` with baseline stamp (port: add `chatAgentic` + `AgenticChatExtras` to src/main/application/ports/MatchCoachingModel.ts)
- [X] T015 [US1] Create src/main/application/commands/ResolveProposal.ts — flow per contracts/ipc-resolve-proposal.md: idempotent re-resolve, staleness gate, mark-resolved-first, apply task/reflection payloads, patch stored MatchAnalysis, revert-on-apply-failure (distillation hook deferred to T030) + test test/unit/ResolveProposal.test.ts (accept per kind, reject, stale, double-accept, apply-failure revert)
- [X] T016 [US1] Wire IPC — rework `coach:chat` handler (sessionId param), add `proposal:resolve`, in src/main/adapters/driving/IpcController.ts + src/preload/index.ts + src/main/infrastructure/container.ts
- [X] T017 [US1] Wire renderer — create src/renderer/src/data/useChatSessions.ts (single-session mode: load-or-draft, send via `window.api.coachChat(matchId, sessionId, msgs)`, persist via `saveChatSession`, resolve via `resolveProposal`, `onTasksUpdated(outcome.analysis)` path); swap CoachChat.tsx stub handlers for the hook. **No layout change**

**Checkpoint**: Task negotiation works end-to-end in a single session — MVP. Validate quickstart steps 1–5, 11.

---

## Phase 4: User Story 2 — Capture reflections, manually or via the coach (Priority: P1)

**Goal**: Many reflections per match; manual create/edit/delete with evidence refs (offline, no model); coach-proposed reflections via the same proposal pipeline; legacy reflection migrated.

**Independent Test**: With network disabled, add a manual reflection with a timeline ref, restart → persists with chip. Online: "save that as a reflection" → card → accept → appears in panel (quickstart steps 6–7, 10).

- [X] T018 [P] [US2] Create src/renderer/src/components/coaching/ReflectionsPanel.tsx against stubs/reflections.ts — list cards (source badge "you"/"Corky", `EvidenceChip` refs, edit/delete), composer consuming the report's pendingRefs pool (clear on save); mount as a Reflections section in src/renderer/src/screens/CoachReport.tsx. **Review gate: walk all four stub states before T019+**
- [X] T019 [US2] Create commands src/main/application/commands/SaveReflection.ts (create/edit, trim + 2000-char cap, refs filtered vs anchor catalog ∪ standing set, ≤5 refs, ≤20/match, `-refl-legacy` adoption path) + src/main/application/commands/DeleteReflection.ts (idempotent) + query src/main/application/queries/ListReflections.ts (contracts/ipc-reflections.md) + test test/unit/SaveReflection.test.ts (validation matrix, legacy adoption no-op on repeat)
- [X] T020 [US2] Wire IPC `reflections:list|save|delete` in src/main/adapters/driving/IpcController.ts + src/preload/index.ts + src/main/infrastructure/container.ts
- [X] T021 [US2] Wire renderer — create src/renderer/src/data/useReflections.ts (optimistic save/delete, reload-on-error); swap ReflectionsPanel stub for the hook; re-point legacy localStorage reflection adoption in CoachChat.tsx to `saveReflection` with the `-refl-legacy` id. **No layout change**
- [X] T022 [US2] Verify coach-path E2E — chat "save that as a reflection" → `create_reflection` proposal card → accept (`ResolveProposal` from T015 writes via ReflectionRepository) → panel updates; update/delete proposals likewise (the loop, sanitiser, and resolve branches exist from US1 — this task is glue verification + fixes)

**Checkpoint**: Both P1 stories complete — tasks negotiable, reflections first-class.

---

## Phase 5: User Story 3 — Multiple chat sessions per match (Priority: P2)

**Goal**: "New chat" + session switcher; fresh sessions know all match facts and reflections with an empty transcript; legacy transcript = first session; empty sessions never persist.

**Independent Test**: Chat in session 1, save a reflection, new chat → coach references the reflection in session 2; switcher shows both; legacy transcript appears as "First session" (quickstart steps 8, 10).

- [X] T023 [P] [US3] Add session switcher + "New chat" UI to src/renderer/src/components/CoachChat.tsx against stubs/chatSessions.ts (metas list newest-first, draft entry, active highlight). **Review gate before T024+**
- [X] T024 [US3] Extend src/renderer/src/data/useChatSessions.ts to multi-session — metas via `listChatSessions`, draft session (opener only, no row), lazy promote on first player send, switch loads via `getChatSession`, `key={sessionId}` remount + per-session hydration/save guards (contracts/ipc-chat-sessions.md renderer contract)
- [X] T025 [US3] Re-point legacy localStorage *transcript* adoption to `saveChatSession(matchId, '<matchId>-sess-legacy', turns)`; retire `chat:transcript:get|save` + `chat:reflection:save` channels and `getChatTranscript`/`saveChatTranscript`/`saveChatReflection` from src/shared/types.ts, src/preload/index.ts, src/main/adapters/driving/IpcController.ts; delete src/main/application/commands/SaveChatTranscript.ts + src/main/application/queries/GetChatTranscript.ts (ChatTranscriptRepository stays as migration source)
- [X] T026 [US3] Verify context guarantee — new session's first reply can cite an existing reflection (REFLECTIONS block from T014); verify no cross-session transcript leakage; acceptance walk quickstart step 8

**Checkpoint**: Sessions work; legacy data fully adopted; old transcript channels gone.

---

## Phase 6: User Story 4 — Tasks are touchable evidence (Priority: P2)

**Goal**: Standing task rows attach `task:<id>` refs to chat messages; refs ground to the task's exact rule server-side; vanished tasks drop silently.

**Independent Test**: Click a task row → chip in composer → send → reply cites the exact rule (quickstart step 9).

- [ ] T027 [P] [US4] Wrap standing-task rows in `Askable` emitting `{ id: 'task:<taskId>', kind: 'task', label: description }` — add optional `onAsk`/`taskId` props to src/renderer/src/components/coaching/FocusTask.tsx, pass the report's `addRef` from src/renderer/src/screens/CoachReport.tsx (pendingRefs pool already exists)
- [ ] T028 [US4] Add `task:` lookup source to src/main/domain/report/resolveChatRefs.ts — render `[TASK <id> "desc" rule=<metric><comparator><target> scope=<scope> status=<status>]` from the standing set (active + retired), unknown ids silently dropped; CoachChat passes the standing set into the renderer factory; extend test/unit (or add) resolveChatRefs coverage for task refs + retired + unknown

**Checkpoint**: Touchable-report pattern complete across stats, markers, benchmarks, and tasks.

---

## Phase 7: User Story 5 — Summarize-into-reflection replaces finalize (Priority: P3)

**Goal**: Finalize ceremony replaced by a proposal-emitting shortcut; memory distillation moves to coach-reflection acceptance; task changes never ride summarize.

**Independent Test**: After chat turns, click "Summarize into a reflection" → standard card → accept → reflection stored, tasks untouched, semantic memory updated shortly after (quickstart steps 7, 12).

- [ ] T029 [P] [US5] Add `summarizeReflectionText` (forced-tool: text + refIds) and `distillMemory` (existing memory projection → `ProposedSemanticObject[]`) to src/main/adapters/driven/anthropic/AnthropicMatchCoachingModel.ts + prompt builders/validators in matchPrompts.ts + port methods in src/main/application/ports/MatchCoachingModel.ts; fake-`CreateMessage` tests
- [ ] T030 [US5] Create src/main/application/commands/SummarizeIntoReflection.ts (≥1 player turn check, pending-proposal check, emits `create_reflection` proposalTurn — research R8) + wire IPC `coach:summarize`; add the fire-and-forget distillation hook to ResolveProposal.ts on accepted coach `create_reflection` (`distillMemory` → `mergeSemanticObjects` → `semanticMemory.upsert`, floating promise, `.catch` → log) + extend ResolveProposal.test.ts (distillation failure doesn't fail accept)
- [ ] T031 [US5] Replace the renderer finalize flow in src/renderer/src/components/CoachChat.tsx — "Summarize into a reflection" button → `window.api.summarizeIntoReflection`, drop the done/reflection view (reflections live in the panel now); delete src/main/application/commands/FinalizeReflection.ts, `summarizeReflection` + `ReflectionExtras`/`ReflectionProposal` from the port and adapter, `coach:reflection:finalize` channel, `finalizeReflection` from IpcApi/preload, `ReflectionOutcome` from src/shared/types.ts; remove dead FinalizeReflection wiring from container.ts; full typecheck + `npm test` sweep

**Checkpoint**: All five stories functional; legacy flow fully removed.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T032 Run the full quickstart.md acceptance walk (12 steps) against a real analysed match; fix anything that fails
- [ ] T033 [P] Update architecture.md — agentic loop (bounded, propose-only), proposals/resolution, reflections store, sessions, revised data-flow diagram and schema section; note the softened "no unbounded tool loops" invariant
- [ ] T034 Cleanup sweep — remove remaining dead code paths referencing `chat_transcripts` outside schema.ts migration + ChatTranscriptRepository (kept as migration source); confirm `npm test` green and lint clean

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → user stories.
- **US1 (3)**: needs T001–T008. Delivers the proposal pipeline (loop, sanitiser, ProposalCard, ResolveProposal) that US2/US5 reuse.
- **US2 (4)**: needs Foundational; reuses US1's pipeline for the coach path (T022) — manual path (T018–T021) only needs T001/T003/T004/T005.
- **US3 (5)**: needs Foundational + T017 (the session-aware hook it extends).
- **US4 (6)**: T027 needs only T001; T028 needs T014 (standing set into the ref renderer).
- **US5 (7)**: needs US1's pipeline + US2's reflection store; T031 removes the legacy flow last.
- **Polish (8)**: after all stories.

### Key cross-story facts

- The proposal pipeline is built ONCE in US1 and reused by US2 (coach reflections) and US5 (summarize) — don't duplicate.
- Channel retirement is split deliberately: transcript channels die in T025 (US3), finalize channel dies in T031 (US5). Until then legacy + new coexist and the app stays runnable at every checkpoint.

### Parallel opportunities

- T002 ∥ T003 (after T001); T005 ∥ T006 (after T004).
- After Foundational: T009 ∥ T011 ∥ T012 (different files); T018 (US2 UI) and T027 (US4 UI) can start any time after Setup — they touch renderer files no other phase edits yet.
- US4 backend (T028) is independent of US2/US3/US5 and can run alongside any of them.

---

## Implementation Strategy

**MVP = Phases 1–3** (Setup + Foundational + US1): task negotiation end-to-end in a single session. Stop, run quickstart steps 1–5 + 11, validate.

**Incremental delivery**: each subsequent phase is a working increment — US2 (reflections) → US3 (sessions, legacy channels retired) → US4 (touchable tasks) → US5 (finalize replaced, legacy flow deleted) → Polish. The app builds and runs at every checkpoint; legacy and new flows coexist until their designated retirement task.

**Single-developer order**: exactly the phase order above. The two review gates (T010, T018/T023) are hard stops per Constitution VIII — UI signed off against stubs before its backend lands.
