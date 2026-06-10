# Contract: Reflections IPC

## Channels

| Channel | Kind | Use case | Signature (IpcApi) |
|---|---|---|---|
| `reflections:list` | query | `ListReflections` | `listReflections(matchId) → Reflection[]` (oldest first) |
| `reflections:save` | command | `SaveReflection` | `saveReflection(input: SaveReflectionInput) → Reflection` |
| `reflections:delete` | command | `DeleteReflection` | `deleteReflection(matchId, reflectionId) → void` |

All three are **model-free and offline-capable** (FR-014).

## Semantics

**`saveReflection`** —
- `input.id` absent → create: mint `${matchId}-refl-${now36}-0`, `source='player'`, both timestamps now.
- `input.id` present → edit: row must exist and belong to `matchId`; text/refs replaced, `updatedAt` bumped, `source` and `createdAt` preserved. Editing a coach reflection is allowed (it's the player's data) — source stays `'coach'`.
- Validation (server): text trimmed, non-empty, ≤2000 chars; refs validated against the match's anchor catalog ∪ `task:<id>` grammar against the standing set — unknown ids silently dropped; ≤5 refs (same cap as chat); ≤20 reflections per match (create beyond cap → error with friendly message).
- **Legacy adoption**: a create carrying the deterministic id `${matchId}-refl-legacy` is accepted as-is with `source='coach'` (INSERT OR IGNORE semantics — adopting twice is a no-op). Used only by the renderer localStorage migration path.

**`deleteReflection`** — hard delete; deleting a missing id is a no-op (idempotent). Coach context simply stops including it on the next call (no dangling state by construction).

**Coach-authored creation** does NOT use these channels — it goes through `proposal:resolve` (accept of a `create_reflection`/`update_reflection`/`delete_reflection` proposal), which performs the same validation and writes through the same `ReflectionRepository`.

## Port (application/ports/ReflectionRepository.ts)

```ts
interface ReflectionRepository {
  list(matchId: string): Reflection[]
  get(id: string): Reflection | null
  upsert(reflection: Reflection): void
  delete(id: string): void
  countForMatch(matchId: string): number
}
```

## Renderer contract

- `useReflections(matchId)`: list + save + delete with optimistic update and reload-on-error.
- `ReflectionsPanel` (report screen): list of reflection cards (source badge "you"/"Corky", ref chips via existing `EvidenceChip`, edit/delete affordances) + composer textarea. The composer consumes the report's **pendingRefs** (same pool the chat composer uses): attached refs show as chips and are cleared on save — clicking a timeline marker then writing a reflection links them (US2 scenario 2).
- Stub-first: `stubs/reflections.ts` covers empty / player-only / mixed / at-refs-cap states.
