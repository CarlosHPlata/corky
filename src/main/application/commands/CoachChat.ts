import type { ChatTurn, CoachChatReply, MatchReport } from '@shared/types'
import type { ResolvedCoachingConfig } from '@shared/config'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import type { MatchCoachingModel, DiscoveryRequest } from '../ports/MatchCoachingModel'
import type { SemanticMemory } from '../ports/SemanticMemory'
import type { BenchmarkDataSource } from '../ports/BenchmarkDataSource'
import type { CoachingConfigRepository } from '../ports/CoachingConfigRepository'
import type { GetHistoryAggregates } from '../queries/GetHistoryAggregates'
import type { SemanticObject } from '../../domain/memory/semanticObject'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { buildCoachBriefing } from '../../domain/report/coachBriefing'
import { makeRefLineRenderer } from '../../domain/report/resolveChatRefs'
import { resolveConfig } from '../../domain/config/coachingConfig'
import { renderHistoryBlock } from '../../domain/history/cohortAggregates'

/** Which config source gates each discovery kind. */
const SOURCE_FOR_KIND: Record<DiscoveryRequest['kind'], string> = {
  memory: 'local-som',
  history: 'local-history',
  benchmark: 'opgg-mcp'
}

/**
 * Post-game coaching chat (spec 004). Rebuilds the per-game briefing in the main
 * process from the stored match + the persisted analysis, so the renderer only
 * carries the transcript and no secrets cross preload (Constitution VI). One call
 * = one coach reply; the transcript lives renderer-side. Offline-grounded: the
 * facts come from stored JSON, only the reply needs connectivity.
 *
 * Agentic discovery (A5): before replying, a bounded LIGHT planning call decides
 * which local/remote data would help with the player's question; the honored
 * requests (gated by config sources, capped by budget tier) are fetched
 * concurrently and appended to the briefing as a compact DOSSIER. Discovery is
 * best-effort all the way down — the chat must never break because it did.
 */
export class CoachChat {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository,
    private readonly goalRepo: SessionGoalRepository,
    private readonly semanticMemory: SemanticMemory,
    private readonly getHistoryAggregates: GetHistoryAggregates,
    private readonly benchmarkSource: BenchmarkDataSource,
    private readonly coachingConfigRepo: CoachingConfigRepository,
    private readonly model: MatchCoachingModel,
    private readonly chatModel: string
  ) {}

  async execute(matchId: string, messages: ChatTurn[]): Promise<CoachChatReply> {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) throw new Error('No synced account')
    const report = this.loadReport(matchId, account.puuid)
    const analysis = this.reportRepo.getMatchAnalysis(matchId)
    const goal = this.goalRepo.get()?.goal?.trim() || undefined
    let briefing = buildCoachBriefing(report, analysis, goal)

    const dossier = await this.runDiscovery(account.puuid, matchId, report, messages)
    if (dossier.length) {
      briefing += `\n\nDOSSIER (fetched for this question)\n${dossier.join('\n')}`
    }

    const reply = await this.model.chat(briefing, this.groundRefs(report, messages), this.chatModel)
    return { reply }
  }

  /**
   * The discovery flow: plan (LIGHT model) → filter by config → fetch in
   * parallel → render dossier lines. Budget tier scales depth: 'eco' skips
   * discovery entirely, 'standard' honors up to 3 requests, 'deep' up to 5.
   * The planner and every individual fetch are guarded — any failure just
   * contributes nothing.
   */
  private async runDiscovery(
    puuid: string,
    matchId: string,
    report: MatchReport,
    messages: ChatTurn[]
  ): Promise<string[]> {
    const config = resolveConfig(this.coachingConfigRepo.get())
    if (config.budgetTier === 'eco') return []
    const question = [...messages].reverse().find((m) => m.role === 'user')?.text.trim()
    if (!question) return []

    let requests: DiscoveryRequest[]
    try {
      const plan = await this.model.planDiscovery(question, this.buildInventory(puuid, config), this.chatModel)
      requests = plan.requests
    } catch {
      return [] // the chat must never break because discovery did
    }

    const enabled = new Set(config.sources.filter((s) => s.enabled).map((s) => s.id))
    const cap = config.budgetTier === 'deep' ? 5 : 3
    const honored = requests.filter((r) => enabled.has(SOURCE_FOR_KIND[r.kind])).slice(0, cap)

    const lines = await Promise.all(honored.map((r) => this.fetchRequest(r, puuid, matchId, report)))
    return lines.flat()
  }

  /** One-line inventory of what discovery could fetch, from cheap local counts.
   * Each count is individually guarded — an unavailable store reads as 0. */
  private buildInventory(puuid: string, config: ResolvedCoachingConfig): string {
    const count = (read: () => number): number => {
      try {
        return read()
      } catch {
        return 0
      }
    }
    const memory = count(
      () => this.semanticMemory.query({ puuid, statuses: ['active', 'confirmed'], limit: 100 }).length
    )
    const history = count(() => this.matchRepo.countMatches(puuid))
    const tasks = count(() => this.reportRepo.getStandingTasks(puuid).length)
    const benchmark = config.sources.some((s) => s.id === SOURCE_FOR_KIND.benchmark && s.enabled)
      ? 'available'
      : 'off'
    return `INVENTORY memory=${memory} history=${history} benchmark=${benchmark} tasks=${tasks}`
  }

  /** Execute one honored request and render its dossier lines. A failed or empty
   * fetch renders nothing — never an error line, never a throw. */
  private async fetchRequest(
    request: DiscoveryRequest,
    puuid: string,
    matchId: string,
    report: MatchReport
  ): Promise<string[]> {
    try {
      if (request.kind === 'memory') {
        return this.semanticMemory
          .query({ puuid, text: request.query, limit: 6 })
          .map(renderMemLine)
      }
      if (request.kind === 'history') {
        const target = {
          champion: report.core.champion,
          role: report.core.role,
          opponentChampion: report.matchup.laneOpponent?.champion
        }
        const agg = this.getHistoryAggregates.execute({ ...target, excludeMatchId: matchId })
        return agg ? [renderHistoryBlock(agg, target)] : []
      }
      // benchmark — same BENCH line grammar as the analysis context (contextBlocks).
      const bench = await this.benchmarkSource.getChampionBenchmark({
        champion: report.core.champion,
        role: report.core.role,
        tier: null
      })
      return bench
        ? [
            `BENCH cs_per_min basis=${bench.basis} ref=${bench.csPerMin}${bench.patch ? ` patch=${bench.patch}` : ''}`
          ]
        : []
    } catch {
      return []
    }
  }

  /**
   * Ground evidence-referenced turns: each message carrying refs gets its REF
   * lines prepended to the text, so the model sees the fact behind the thing the
   * player pointed at. The anchor catalog is built lazily, once, on the first ref
   * encountered; turns without refs pass through untouched.
   */
  private groundRefs(report: MatchReport, messages: ChatTurn[]): ChatTurn[] {
    const render = makeRefLineRenderer(report)
    return messages.map((m) => {
      if (!m.refs?.length) return m
      const lines = render(m.refs)
      if (!lines.length) return m
      return { ...m, text: `${lines.join('\n')}\n\n${m.text}` }
    })
  }

  private loadReport(matchId: string, puuid: string): MatchReport {
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
    return assembleMatchReport(rawMatch, rawTimeline, puuid)
  }
}

/** Render one recalled memory object as a compact MEM dossier line,
 * e.g. `MEM kind=pattern champ=ahri x3 "dies solo in river 14-20min"`. */
function renderMemLine(o: SemanticObject): string {
  const tags = [
    `kind=${o.kind}`,
    ...(o.champion ? [`champ=${o.champion}`] : []),
    ...(o.role ? [`role=${o.role}`] : []),
    ...(o.phase ? [`phase=${o.phase}`] : []),
    ...(o.metric ? [`metric=${o.metric}`] : [])
  ]
  return `MEM ${tags.join(' ')} x${o.occurrences} "${o.statement}"`
}
