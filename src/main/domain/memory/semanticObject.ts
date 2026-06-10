// Semantic Object Memory (SOM) — small typed coaching facts distilled from
// analysed games ("pattern: dies solo in river 14–20min"), accumulated over
// time so the coach can reason longitudinally instead of per-game.

const KINDS = ['observation', 'pattern', 'strength', 'weakness', 'reflection', 'milestone'] as const
const MAX_STATEMENT_CHARS = 240
const MAX_EVIDENCE = 10

export type SemanticObjectKind = (typeof KINDS)[number]

export type SemanticObjectStatus = 'active' | 'confirmed' | 'stale' | 'resolved'

export interface SemanticObject {
  id: string
  kind: SemanticObjectKind
  champion?: string
  role?: string
  phase?: 'lane' | 'mid' | 'close'
  metric?: string
  statement: string
  evidenceMatchIds: string[]
  occurrences: number
  firstSeen: number
  lastSeen: number
  status: SemanticObjectStatus
}

/** An object proposed by the model — without the orchestrator-assigned fields. */
export type ProposedSemanticObject = Pick<
  SemanticObject,
  'kind' | 'champion' | 'role' | 'phase' | 'metric' | 'statement'
>

/** True when a proposed object is well-formed (else drop it). */
export function isValidProposedObject(p: ProposedSemanticObject): boolean {
  if (!KINDS.includes(p.kind)) return false
  const statement = p.statement?.trim()
  if (!statement || statement.length > MAX_STATEMENT_CHARS) return false
  return true
}

/**
 * The identity of what an object is *about* — same subject means same memory,
 * updated in place rather than duplicated. Champion/role are lowercased so
 * model spelling drift ("Ahri" vs "ahri") doesn't fork a subject.
 */
export function subjectKey(o: ProposedSemanticObject): string {
  return `${o.kind}|${(o.champion ?? '').toLowerCase()}|${(o.role ?? '').toLowerCase()}|${o.phase ?? ''}|${o.metric ?? ''}`
}

/**
 * Merge a model's proposed objects into the existing memory, returning ONLY the
 * rows to upsert. A valid proposal whose subject already exists (non-resolved)
 * refreshes that object: statement replaced, occurrences+1, lastSeen bumped,
 * the source match appended as evidence, and a 'stale' object revived to
 * 'active'. A genuinely new subject mints `${sourceMatchId}-mem-${index}`.
 * Proposals sharing a subject within one call are deduped (first wins).
 * Existing objects that weren't matched are never touched — additive semantics,
 * like FinalizeReflection.applyProposal. Pure.
 */
export function mergeSemanticObjects(
  proposed: ProposedSemanticObject[],
  existing: SemanticObject[],
  sourceMatchId: string,
  now: number
): SemanticObject[] {
  const seen = new Set<string>()
  const upserts: SemanticObject[] = []
  proposed.forEach((p, index) => {
    if (!isValidProposedObject(p)) return
    const key = subjectKey(p)
    if (seen.has(key)) return
    seen.add(key)
    const match = existing.find((e) => e.status !== 'resolved' && subjectKey(e) === key)
    if (match) {
      upserts.push({
        ...match,
        statement: p.statement.trim(),
        evidenceMatchIds: appendEvidence(match.evidenceMatchIds, sourceMatchId),
        occurrences: match.occurrences + 1,
        lastSeen: now,
        status: match.status === 'stale' ? 'active' : match.status
      })
    } else {
      upserts.push({
        id: `${sourceMatchId}-mem-${index}`,
        kind: p.kind,
        ...(p.champion ? { champion: p.champion } : {}),
        ...(p.role ? { role: p.role } : {}),
        ...(p.phase ? { phase: p.phase } : {}),
        ...(p.metric ? { metric: p.metric } : {}),
        statement: p.statement.trim(),
        evidenceMatchIds: [sourceMatchId],
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
        status: 'active'
      })
    }
  })
  return upserts
}

/** Append a match id once, keeping only the most recent MAX_EVIDENCE entries. */
function appendEvidence(ids: string[], matchId: string): string[] {
  const next = ids.includes(matchId) ? [...ids] : [...ids, matchId]
  return next.slice(-MAX_EVIDENCE)
}
