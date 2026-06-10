# Quickstart: Agentic Coach Chat (005)

Build order is **stub-first** (Constitution VIII): renderer against stubs → review → backend → wire → verify.

## 0. Prerequisites

- Branch `005-agentic-coach-chat`; `npm install` done; at least one synced + analysed match in the local DB (for end-to-end verification).
- `npm test` green before starting.

## 1. Shared types & stubs (frontend phase)

1. Add the new DTOs to `src/shared/types.ts` (`Reflection`, `ChatSessionMeta/ChatSession`, `ActionProposal` + `ChatTurn.proposal`, `EvidenceRef` kind `'task'`, reworked `CoachChatReply`, `ResolveProposal*`, `SaveReflectionInput`). Remove `ReflectionOutcome` only in the wiring phase (keep compiling).
2. Create `stubs/chatSessions.ts` — two sessions for one match; turns covering: plain chat, task proposal pending, task proposal accepted, reflection proposal rejected, stale task proposal.
3. Create `stubs/reflections.ts` — empty / player-only / mixed player+coach with refs / at-cap.

## 2. Renderer against stubs

4. `ProposalCard.tsx` — all four resolution states; task variant renders `FocusTask` rows + retiring line; reflection variant renders text + `EvidenceChip` refs.
5. `CoachChat.tsx` rework — session switcher + "New chat" (draft, lazy), proposal cards in thread, "Summarize into a reflection" button replacing "Save reflection", task-negotiation opener/starters.
6. `ReflectionsPanel.tsx` on `CoachReport.tsx` — list + composer consuming the report's pendingRefs pool.
7. `FocusTask.tsx` — optional `Askable` wrapper emitting `task:<id>` refs into pendingRefs.
8. **Review gate**: walk every stub state visually. Sign off before any backend work.

## 3. Domain & adapter (backend phase)

9. `domain/chat/proposal.ts` + `test/unit/proposal.test.ts` (sanitise / baseline / stale / cardinality).
10. `matchPrompts.ts`: propose-tool schemas, payload validators, agentic scaffold + `chat.agentic` registry entry; extend `matchPrompts.test.ts`.
11. `AnthropicMatchCoachingModel.chatAgentic` loop (cap 3, last-valid-wins, pending-blocks-new, text fallback) + `summarizeReflectionText` + `distillMemory`; fake-`CreateMessage` tests.
12. `schema.ts`: `reflections` + `chat_sessions` + idempotent `INSERT OR IGNORE` migration; `SqliteReflectionRepository`, `SqliteChatSessionRepository` (transactional `resolveProposal`); migration idempotency test (ABI caveat: may need Electron-ABI run).
13. Commands/queries: rework `CoachChat`; add `ResolveProposal` (+ test), `SaveReflection`, `DeleteReflection`, `SummarizeIntoReflection`, `SaveChatSession`, `ListReflections`, `GetChatSessions`. Delete `FinalizeReflection` + `summarizeReflection` port method.
14. `IpcController` + preload + `container.ts`: new channels in, retired channels out.

## 4. Wire & migrate (swap phase — no UI changes)

15. Swap stub imports for `window.api.*` in `useChatSessions` / `useReflections`; re-point legacy localStorage adoption to `saveChatSession`/`saveReflection` with `-legacy` ids.
16. `npm test` green; typecheck clean (`ReflectionOutcome` and retired channels now removed).

## 5. Verify end-to-end (acceptance walk)

| # | Action | Expect |
|---|---|---|
| 1 | Open analysed match → chat | Task-negotiation opener; session switcher shows legacy "First session" if one existed |
| 2 | "Make the CS task stricter" | Proposal card (pending) with full resulting set; DB unchanged |
| 3 | Accept | Card → accepted; Next-game focus + Home update without re-analyse; restart app → still applied |
| 4 | Ask another change → Reject | Card → rejected; tasks unchanged; coach acknowledges next turn |
| 5 | Accept a task proposal after re-running analysis (set changed) | Card → stale, nothing applied |
| 6 | Click a timeline death → write manual reflection | Reflection saved with ref chip; works with network disabled |
| 7 | "Save what we discussed as a reflection" → Accept | Coach reflection appears in panel; semantic memory gains/refreshes objects shortly after |
| 8 | New chat → ask "what did I write in my reflections?" | Coach answers from reflections; transcript empty otherwise; switcher shows both sessions |
| 9 | Click a standing task row → ask about it | `task:` chip rides the message; reply cites the exact rule |
| 10 | Match upgraded from 004 (had transcript + reflection) | First session + first reflection present; restart twice → no duplicates |
| 11 | Double-click Accept rapidly | One application; card resolves once |
| 12 | "Summarize into a reflection" | Standard reflection proposal card; accept stores it; tasks untouched |
