import type { EvidenceRef, MatchReport, Reflection, SaveReflectionInput } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { ReflectionRepository } from '../ports/ReflectionRepository'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { buildAnchorCatalog } from '../../domain/report/anchorCatalog'
import { REFLECTION_TEXT_CAP } from '../../domain/chat/proposal'

const MAX_REFS = 5
const MAX_PER_MATCH = 20

/**
 * Manual reflection create/edit (spec 005, FR-013/FR-014): no model call, fully
 * offline. Server-side validation mirrors the proposal sanitiser: text trimmed
 * and capped, refs filtered against the match's anchor catalog ∪ the standing
 * set's `task:` grammar (unknown ids dropped silently), at most 5 refs, at most
 * 20 reflections per match.
 *
 * The deterministic `-refl-legacy` id is the renderer localStorage adoption
 * path: creating it twice is a no-op returning the stored row, keeping the
 * adoption idempotent with the schema migration (source stays 'coach').
 */
export class SaveReflection {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository,
    private readonly reflections: ReflectionRepository,
    private readonly now: () => number = () => Date.now()
  ) {}

  execute(input: SaveReflectionInput): Reflection {
    const text = (input.text ?? '').trim().slice(0, REFLECTION_TEXT_CAP)
    if (!text) throw new Error('A reflection needs some text')
    const refs = this.filterRefs(input.matchId, input.refs ?? [])
    const at = this.now()
    const isLegacyAdoption = input.id === `${input.matchId}-refl-legacy`

    if (input.id && !isLegacyAdoption) {
      // Edit: replace text/refs, preserve author + creation time.
      const current = this.reflections.get(input.id)
      if (!current || current.matchId !== input.matchId) throw new Error('Reflection not found')
      const updated: Reflection = { ...current, text, refs, updatedAt: at }
      this.reflections.upsert(updated)
      return updated
    }

    if (isLegacyAdoption) {
      const existing = this.reflections.get(input.id!)
      if (existing) return existing // adopting twice is a no-op
    } else if (this.reflections.countForMatch(input.matchId) >= MAX_PER_MATCH) {
      throw new Error(`This game already holds ${MAX_PER_MATCH} reflections — delete one first`)
    }

    const created: Reflection = {
      id: isLegacyAdoption ? input.id! : `${input.matchId}-refl-${at.toString(36)}-0`,
      matchId: input.matchId,
      text,
      refs: isLegacyAdoption ? [] : refs,
      source: isLegacyAdoption ? 'coach' : 'player',
      createdAt: at,
      updatedAt: at
    }
    this.reflections.upsert(created)
    return created
  }

  /** Keep only refs that resolve in this match: anchor-catalog ids and
   * `task:<id>` ids over the CURRENT standing set. Labels pass through. */
  private filterRefs(matchId: string, refs: EvidenceRef[]): EvidenceRef[] {
    if (!refs.length) return []
    const valid = new Set<string>(buildAnchorCatalog(this.loadReport(matchId)).keys())
    const account = this.matchRepo.getCurrentAccount()
    if (account) {
      for (const t of this.reportRepo.getStandingTasks(account.puuid)) valid.add(`task:${t.id}`)
    }
    const seen = new Set<string>()
    return refs
      .filter((r) => {
        if (!valid.has(r.id) || seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      .slice(0, MAX_REFS)
  }

  private loadReport(matchId: string): MatchReport {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) throw new Error('No synced account')
    const detail = this.matchRepo.getMatchDetail(matchId)
    if (!detail) throw new Error('Match not stored locally')
    const rawMatch = JSON.parse(detail.rawJson)
    const timelineRow = this.matchRepo.getTimeline(matchId)
    let rawTimeline: unknown | null = null
    if (timelineRow) {
      try {
        rawTimeline = JSON.parse(timelineRow.rawJson)
      } catch {
        rawTimeline = null
      }
    }
    return assembleMatchReport(rawMatch, rawTimeline, account.puuid)
  }
}
