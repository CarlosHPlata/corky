# Contract: Agentic Chat Tool Loop (`MatchCoachingModel.chatAgentic`)

## Port signature

```ts
chatAgentic(
  briefing: string,            // factual brief + DOSSIER + REFLECTIONS block (built by CoachChat)
  history: ChatTurn[],         // grounded turns incl. rendered proposal outcomes
  extras: AgenticChatExtras,   // standing set, metric keys, reflection projection, valid ref ids
  model: string                // light tier
): Promise<{ reply: string; rawProposal?: RawProposal }>
```

The adapter NEVER performs side effects. It returns text plus at most one raw proposal; the command sanitises and decides whether a proposal turn is minted.

## Tools exposed to the model (`tool_choice: auto`)

| Tool | Input schema (summary) | Captured as |
|---|---|---|
| `propose_update_tasks` | `{ set: GeneratedTask[], retire: string[] }` — full intended resulting set + explicit retires | `RawTaskProposal` |
| `propose_create_reflection` | `{ text: string, refIds: string[] }` | `RawReflectionProposal` |
| `propose_update_reflection` | `{ reflectionId: string, text: string, refIds: string[] }` | `RawReflectionProposal` |
| `propose_delete_reflection` | `{ reflectionId: string }` | `RawReflectionProposal` |

`GeneratedTask` is the existing pass-4 shape (`description, metric, comparator, target, scope, champion?, role?`).

## Loop rules (hard requirements)

1. **Round cap**: at most **3** assistant tool rounds per call. On reaching the cap the loop forces a final text-only completion (`tool_choice: none`).
2. **Synthetic results**: every captured tool call is answered with `tool_result: "Proposal recorded — it will be shown to the player for confirmation. Continue your reply in plain text."` Malformed payloads (schema validation fails) are answered with `tool_result (is_error): "<reason> — fix the payload or continue without proposing."`
3. **Last-valid-wins**: if multiple valid proposal calls occur in one loop, only the **last** is returned; earlier ones are superseded silently.
4. **Pending-blocks-new**: when `extras` indicates a pending proposal already exists in the session, tool calls are answered with `tool_result (is_error): "A proposal is already awaiting the player's decision."` and `rawProposal` stays undefined.
5. **Failure degrades to text**: any loop error after the first text content (network mid-loop, repeated malformed payloads) returns the accumulated text as `reply` with no proposal. An error before any content propagates (caller shows the existing "couldn't reach my notes" bubble).
6. **No data tools**: discovery (memory/history/benchmark) stays in the pre-loop planning step; the loop has propose-tools only.

## System-prompt requirements (locked scaffold layer, `matchPrompts.ts`)

- Primary objective: leave the session with a settled next-game task set (FR-011); nudge — never spam (propose only on player intent or a natural settling moment).
- Tasks: full-resulting-set discipline (never empty-by-omission, 1–3, computable metrics from the provided key list only); reference current tasks by their ids.
- Reflections: first-person player voice; refs only from the provided valid id list.
- Mention proposals in the reply text naturally ("I've drafted that change — take a look") since the card renders beside it.
- Anchor-citation and never-invent-numbers rules carried over verbatim from the existing chat scaffold.
- The editable coaching-instructions layer (promptRegistry) gains one new pass entry: `chat.agentic` (persona/tone only; the scaffold above is locked).

## Sanitisation (in command, pure `domain/chat/proposal.ts`) — before any persistence

| Raw | Checks | On failure |
|---|---|---|
| `update_tasks` | every task validates against metric registry; `mergeStanding` dry-run; `enforceStandingSet` result is 1–3; retire ids ⊆ current set ids; resulting set ≠ current set | proposal suppressed → plain reply |
| `create_reflection` | text non-empty ≤2000 after trim; refIds filtered to valid set (unknown dropped, not fatal) | suppressed only if text empty |
| `update_reflection` | target id exists; text rules as above | suppressed |
| `delete_reflection` | target id exists | suppressed |

Surviving payloads get `baseline` stamped (`standingBaseline(standing)` / target `updatedAt`) and are embedded as a `pending` `ActionProposal` in the assistant turn.

## Companion methods (same adapter, forced-tool, no loop)

```ts
summarizeReflectionText(briefing, history, model) → { text, refIds }   // for SummarizeIntoReflection
distillMemory(briefing, history, existingMemory, model) → ProposedSemanticObject[]  // post-accept, best-effort
```

## Tests (fake `CreateMessage`)

- 0 tool calls → `{ reply, rawProposal: undefined }`.
- 1 valid `propose_update_tasks` → captured; loop continues to text.
- 2 proposals in one loop → last wins.
- 4 attempted rounds → cap enforced, forced text completion, ≤3 rounds observed.
- Malformed payload → is_error result fed back; no proposal escapes.
- Pending-exists flag → tool refused, no proposal.
