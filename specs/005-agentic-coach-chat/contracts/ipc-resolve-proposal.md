# Contract: Proposal Resolution IPC

## Channel

| Channel | Kind | Use case | Signature (IpcApi) |
|---|---|---|---|
| `proposal:resolve` | command | `ResolveProposal` | `resolveProposal(input: ResolveProposalInput) → ResolveProposalOutcome` |

`ResolveProposalInput = { matchId, sessionId, proposalId, decision: 'accept' | 'reject' }`

## Command flow (`ResolveProposal.execute`)

```
1. session = chatSessionRepo.get(sessionId)            — missing → error
2. locate proposal by id in session turns               — missing → error
3. if proposal.resolution !== 'pending'                 → return recorded outcome (idempotent; SC-007)
4. decision === 'reject':
     chatSessionRepo.resolveProposal(sessionId, proposalId, 'rejected')   — transactional, exactly-once
     return { resolution: 'rejected', analysis: null, reflection: null }
5. decision === 'accept' — staleness gate (domain/chat/proposal.ts):
     update_tasks:        standingBaseline(current standing) !== payload.baseline → STALE
     update/delete_refl:  target missing OR target.updatedAt !== payload.baseline → STALE
     create_reflection:   reflection cap reached → STALE (only stale source for creates)
   STALE → chatSessionRepo.resolveProposal(..., 'stale'); return { resolution: 'stale', ... nulls }
6. mark resolved FIRST: chatSessionRepo.resolveProposal(..., 'accepted')
   (a concurrent second accept now reads non-pending at step 3)
7. apply:
     update_tasks:
       reportRepo.retireStandingTasks(payload.retireIds, now)
       reportRepo.saveStandingTasks(puuid, payload.set, now)
       patch stored MatchAnalysis.tasks.standing if present → outcome.analysis (re-render, no re-analyse)
     create_reflection:  reflectionRepo.upsert(minted row, source='coach') → outcome.reflection
     update_reflection:  reflectionRepo.upsert(edited row)                → outcome.reflection
     delete_reflection:  reflectionRepo.delete(id)
8. accepted create_reflection (coach) → fire-and-forget distillation:
     model.distillMemory(briefing, session turns, existingMemory, lightModel)
       .then(mergeSemanticObjects → semanticMemory.upsert).catch(log)
   — NEVER blocks or fails the accept (FR-024, R5).
```

## Hard requirements

- **Exactly-once**: step 6 is a better-sqlite3 transaction (load row → assert pending → write resolution). Double-clicks and cross-window repeats converge on one applied change; later calls return the recorded outcome (SC-007).
- **Stale never applies**: a stale accept changes nothing but the card state; the renderer shows "the task set changed since this was proposed — ask Corky again" (FR-007).
- **No partial application**: step 7's task writes run inside one transaction with step 6 where feasible; on apply failure after marking accepted, the command reverts the resolution to pending and rethrows (the card stays actionable).
- **Feedback to the coach**: no push channel. The next `coachChat` call renders resolved proposals from the transcript as bracketed outcome lines (`[player accepted the task change]`, `[player rejected the proposal]`, `[proposal went stale]`) — see R10 (FR-005).

## Renderer contract (`ProposalCard`)

- States: `pending` (Accept / Reject buttons), `accepted` (✓ + applied summary), `rejected` (struck style), `stale` (warning + "ask again" hint).
- Buttons disable on first click; the card re-renders from the `ResolveProposalOutcome` + updated turn persisted via `saveChatSession` (the command already wrote the resolution server-side; the renderer save is the turn-content sync, which must not alter resolutions — see ipc-chat-sessions.md).
- Task cards render the FULL resulting set as `FocusTask` rows + explicit "retiring: …" line. Reflection cards render full text + ref chips.
- On `accepted` with `outcome.analysis` → call the existing `onTasksUpdated(analysis)` path (report + Home refresh).

## Tests

- accept happy path per payload kind (fake repos).
- reject → nothing applied.
- stale via baseline mismatch (task set mutated between mint and accept).
- double accept → second returns recorded outcome, single application.
- apply-failure → resolution reverted to pending.
- distillation failure → accept still succeeds (floating promise caught).
