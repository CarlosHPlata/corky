import type { EvidenceRef, ProposalPayload, Reflection, StandingFocusTask } from '@shared/types'
import type { GeneratedTask } from '../report/focusTask'
import { enforceStandingSet, isValidTask } from '../report/focusTask'

// Pure (no I/O). The sanitisation and staleness core of confirm-first proposals
// (spec 005). Raw tool payloads from the model are validated HERE, before the
// proposal turn is ever persisted — a stored proposal is always acceptable
// modulo staleness. `null` means "suppress: degrade to a plain reply".

/** Raw `propose_update_tasks` payload as the model emits it. `set` is the FULL
 * intended resulting standing set; `retire` lists explicitly-dropped task ids. */
export interface RawTaskProposal {
  set: GeneratedTask[]
  retire: string[]
}

/** Raw reflection payload as the model emits it (create/update/delete share a
 * shape; update/delete carry `reflectionId`, delete ignores text/refs). */
export interface RawReflectionProposal {
  kind: 'create_reflection' | 'update_reflection' | 'delete_reflection'
  text?: string
  refIds?: string[]
  reflectionId?: string
}

export type RawProposal =
  | ({ kind: 'update_tasks' } & RawTaskProposal)
  | RawReflectionProposal

export const REFLECTION_TEXT_CAP = 2000
const MAX_REFLECTION_REFS = 5

/** Shape signature of the ACTIVE standing set — the task-proposal baseline.
 * Any intervening mutation (re-analysis, an accept elsewhere) changes it. */
export function standingBaseline(standing: StandingFocusTask[]): string {
  return standing
    .filter((t) => t.status === 'active')
    .map((t) => `${t.id}|${t.metric}|${t.comparator}|${t.target}|${t.scope}`)
    .sort()
    .join('||')
}

/** Two tasks share a checkable shape (same merge rule as FinalizeReflection had). */
function sameShape(a: StandingFocusTask, b: StandingFocusTask): boolean {
  return a.metric === b.metric && a.comparator === b.comparator && a.target === b.target && a.scope === b.scope
}

/** The lane a task occupies: a proposed task with the same metric+scope target
 * MODIFIES the existing one (inherits its id) rather than sitting beside it —
 * "make the CS task stricter" must never leave both versions standing. */
function laneKey(t: Pick<StandingFocusTask, 'metric' | 'scope' | 'champion' | 'role'>): string {
  return `${t.metric}|${t.scope}|${(t.champion ?? '').toLowerCase()}|${(t.role ?? '').toLowerCase()}`
}

/**
 * Sanitise a raw task proposal into an acceptable `update_tasks` payload.
 *
 * The model's `set` is its intended FULL resulting set: validated, mapped onto
 * the existing task in the same lane (metric+scope) where one exists — a
 * modification inherits the id — and minted (`${matchId}-chat-task-…`) where
 * genuinely new. Explicit-retire-only discipline: any current active task the
 * model omitted WITHOUT retiring is folded back in (a proposal can never drop
 * tasks by omission — FR-009), model-intended tasks first, capped at 3. A
 * retire that names a task a same-lane replacement already claims is ignored —
 * that lane is modified in place, never emptied then left without its new task.
 *
 * Returns null (suppress) when: nothing valid survives, the set would empty a
 * non-empty standing set, or the result is a no-op against the current set.
 */
export function sanitizeTaskProposal(
  raw: RawTaskProposal,
  standing: StandingFocusTask[],
  matchId: string,
  now: number
): Extract<ProposalPayload, { kind: 'update_tasks' }> | null {
  const active = standing.filter((t) => t.status === 'active')

  // Distinct id seed from analysis (`matchId`) and finalize (`${matchId}-refl`)
  // mints, so a chat proposal can never collide with either.
  const mint = `${matchId}-chat-task-${now.toString(36)}-`
  const claimed = new Set<string>()
  const proposed: StandingFocusTask[] = (raw.set ?? []).filter(isValidTask).map((g, i) => {
    const existing = active.find((s) => !claimed.has(s.id) && laneKey(s) === laneKey(g))
    if (existing) claimed.add(existing.id)
    return {
      id: existing?.id ?? `${mint}${i}`,
      description: g.description,
      metric: g.metric,
      comparator: g.comparator,
      target: g.target,
      scope: g.scope,
      ...(g.champion ? { champion: g.champion } : {}),
      ...(g.role ? { role: g.role } : {}),
      status: 'active',
      sourceMatchId: existing?.sourceMatchId ?? matchId
    }
  })

  // A claimed id is a same-lane task being MODIFIED in place by its replacement,
  // not retired — exclude claimed ids from the retire list so "replace the gold
  // task" can't both delete the lane AND discard the replacement that inherited
  // its id (which the old `proposed.filter(!retired)` below would then drop).
  const activeIds = new Set(active.map((t) => t.id))
  const retireIds = [...new Set((raw.retire ?? []).filter((id) => activeIds.has(id) && !claimed.has(id)))]
  const retired = new Set(retireIds)

  const kept = active.filter(
    (t) => !retired.has(t.id) && !claimed.has(t.id) && !proposed.some((p) => sameShape(p, t))
  )
  const set = enforceStandingSet([...proposed, ...kept])

  // Never empty a non-empty set; never present an empty card.
  if (set.length === 0) return null
  // No-op proposals are noise — the card must always show a real change.
  if (standingBaseline(set) === standingBaseline(active)) return null

  return { kind: 'update_tasks', set, retireIds, baseline: standingBaseline(standing) }
}

/** Infer an EvidenceRef's kind from its id grammar (labels resolve in the UI). */
function refFromId(id: string): EvidenceRef {
  const kind = id.startsWith('task:')
    ? 'task'
    : id.startsWith('stat:')
      ? 'stat'
      : id.startsWith('marker:')
        ? 'marker'
        : id.startsWith('benchmark')
          ? 'benchmark'
          : 'note'
  return { id, kind }
}

/**
 * Sanitise a raw reflection proposal. Unknown ref ids are dropped silently
 * (consistent with chat-ref grounding); an unknown update/delete target or an
 * empty create/update text suppresses the whole proposal.
 */
export function sanitizeReflectionProposal(
  raw: RawReflectionProposal,
  validRefIds: ReadonlySet<string>,
  reflections: Pick<Reflection, 'id' | 'updatedAt'>[]
): Exclude<ProposalPayload, { kind: 'update_tasks' }> | null {
  if (raw.kind === 'delete_reflection') {
    const target = reflections.find((r) => r.id === raw.reflectionId)
    if (!target) return null
    return { kind: 'delete_reflection', reflectionId: target.id, baseline: target.updatedAt }
  }

  const text = (raw.text ?? '').trim().slice(0, REFLECTION_TEXT_CAP)
  if (!text) return null
  const refs = [...new Set(raw.refIds ?? [])]
    .filter((id) => validRefIds.has(id))
    .slice(0, MAX_REFLECTION_REFS)
    .map(refFromId)

  if (raw.kind === 'create_reflection') {
    return { kind: 'create_reflection', text, refs }
  }
  const target = reflections.find((r) => r.id === raw.reflectionId)
  if (!target) return null
  return { kind: 'update_reflection', reflectionId: target.id, text, refs, baseline: target.updatedAt }
}

/** A task proposal is stale when the standing set's shape moved since mint. */
export function isTaskProposalStale(
  payload: Extract<ProposalPayload, { kind: 'update_tasks' }>,
  currentStanding: StandingFocusTask[]
): boolean {
  return payload.baseline !== standingBaseline(currentStanding)
}

/** An update/delete reflection proposal is stale when its target vanished or
 * was edited since mint. Creates carry no baseline (cap is checked at accept). */
export function isReflectionProposalStale(
  payload: Exclude<ProposalPayload, { kind: 'update_tasks' }>,
  currentTarget: Pick<Reflection, 'updatedAt'> | null
): boolean {
  if (payload.kind === 'create_reflection') return false
  return !currentTarget || currentTarget.updatedAt !== payload.baseline
}

/** Collision-proof proposal id (FR-027): timestamp segment survives repeats. */
export function mintProposalId(sessionId: string, now: number): string {
  return `${sessionId}-prop-${now.toString(36)}`
}
