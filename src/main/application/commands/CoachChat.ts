import type { ChatTurn, CoachChatReply, MatchReport, StandingFocusTask } from '@shared/types'
import type { ResolvedCoachingConfig } from '@shared/config'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { MatchCoachingModel, DiscoveryRequest, AgenticChatExtras, AgenticChatResult } from '../ports/MatchCoachingModel'
import type { SemanticMemory } from '../ports/SemanticMemory'
import type { BenchmarkDataSource } from '../ports/BenchmarkDataSource'
import type { ChampionInsightsDataSource } from '../ports/ChampionInsightsDataSource'
import type { CoachingConfigRepository } from '../ports/CoachingConfigRepository'
import type { GetHistoryAggregates } from '../queries/GetHistoryAggregates'
import type { SemanticObject } from '../../domain/memory/semanticObject'
import { makeRefLineRenderer } from '../../domain/report/resolveChatRefs'
import { buildAnchorCatalog } from '../../domain/report/anchorCatalog'
import { resolveConfig } from '../../domain/config/coachingConfig'
import { eventBus } from '../events/EventBus'
import { renderHistoryBlock } from '../../domain/history/cohortAggregates'
import { METRIC_KEYS } from '../../domain/report/metricRegistry'
import {
  sanitizeTaskProposal,
  sanitizeReflectionProposal,
  mintProposalId
} from '../../domain/chat/proposal'
import { MatchService } from '../services/Match/MatchService'
import { Match } from 'src/main/domain/entities/Match'

/** Which config source gates each discovery kind. */
const SOURCE_FOR_KIND: Record<DiscoveryRequest['kind'], string> = {
  memory: 'local-som',
  history: 'local-history',
  benchmark: 'opgg-mcp',
  champion_build: 'opgg-mcp',
  lane_matchup: 'opgg-mcp'
}

/**
 * Post-game coaching chat (spec 004, agentic since spec 005). Rebuilds the
 * per-game briefing in the main process from the stored match + the persisted
 * analysis + this match's reflections, so the renderer only carries the
 * transcript and no secrets cross preload (Constitution VI). One call = one
 * coach reply, possibly carrying ONE confirm-first proposal turn: the model
 * proposes via the bounded tool loop, the sanitiser (domain/chat/proposal)
 * disposes, and NOTHING persists until the player accepts (ResolveProposal).
 *
 * Agentic discovery (A5) is unchanged: a bounded LIGHT planning call decides
 * which local/remote data would help, fetched concurrently into a DOSSIER.
 * Discovery is best-effort all the way down — the chat never breaks because
 * it did.
 */
export class CoachChat {
  constructor(
    private readonly matchService: MatchService,
    private readonly semanticMemory: SemanticMemory, //SO
    private readonly getHistoryAggregates: GetHistoryAggregates, //Application FUnctionality
    private readonly benchmarkSource: BenchmarkDataSource, //OPGG MCP
    private readonly insightsSource: ChampionInsightsDataSource, //OPGG MCP
    private readonly coachingConfigRepo: CoachingConfigRepository, // SQL
    private readonly model: MatchCoachingModel, // LLM
    private readonly chatModel: string,
    private readonly now: () => number = () => Date.now()
  ) { }

  async execute(matchId: string, sessionId: string, messages: ChatTurn[]): Promise<CoachChatReply> {
    const match = await this.matchService.getMatch(matchId)
    const briefing = await this.getBriefingWithDossier(match, messages)

    // One pending card at a time: with one already in the transcript, the model
    // is told (and tool calls refused), so this turn can only be conversational.
    const hasPendingProposal = messages.some((m) => m.proposal?.resolution === 'pending')
    const extras: AgenticChatExtras = {
      standing: match.standings ?? [],
      working: this.workingMemory(match.account.puuid),
      catalogMetricKeys: [...METRIC_KEYS],
      reflections: match.reflections?.map((r) => ({ id: r.id, source: r.source, text: r.text })) ?? [],
      hasPendingProposal
    }

    // the main agent ask
    const result = await this.model.chatAgentic(
      briefing,
      this.groundTurns(match.report, match.standings ?? [], messages),
      extras,
      this.chatModel
    )

    if (!result.rawProposal || hasPendingProposal) return { reply: result.reply }

    // Sanitise BEFORE the turn exists: a persisted proposal is always
    // acceptable modulo staleness (FR-010). A suppressed proposal degrades to
    // the plain reply — the player never sees an unacceptable card.
    const at = this.now()
    const payload =
      result.rawProposal.kind === 'update_tasks'
        ? sanitizeTaskProposal(result.rawProposal, match.standings ?? [], matchId, at)
        : sanitizeReflectionProposal(
          result.rawProposal,
          this.validRefIds(match.report, match.standings?.map((t) => t.id) ?? []),
          match.reflections ?? []
        )
    if (!payload) return { reply: result.reply }

    const proposalTurn: ChatTurn = {
      role: 'assistant',
      text: result.reply,
      proposal: { id: mintProposalId(sessionId, at), payload, resolution: 'pending' }
    }
    return { reply: result.reply, proposalTurn }
  }

  /** Always-on context: the patterns/weaknesses the coach is still tracking
   * for this player (occurrences-first, like the Home progress card). Guarded —
   * an unavailable store contributes nothing and the chat carries on. */
  private workingMemory(puuid: string): AgenticChatExtras['working'] {
    try {
      return this.semanticMemory
        .query({ puuid, kinds: ['pattern', 'weakness'], statuses: ['active', 'confirmed'], limit: 4 })
        .map((o) => ({ statement: o.statement, kind: o.kind, occurrences: o.occurrences }))
    } catch {
      return []
    }
  }

  private async getBriefingWithDossier(match: Match, messages: ChatTurn[]) {
    let briefing = match.coachBriefing()
    const dossier = await this.runDiscovery(match.account.puuid, match.matchId, match.report, messages)

    if (dossier.length) {
      briefing += `\n\nDOSSIER (fetched for this question)\n${dossier.join('\n')}`
    }

    return briefing
  }

  /** Every id a reflection proposal may cite: report anchors ∪ task:<id>. */
  private validRefIds(report: MatchReport, taskIds: string[]): Set<string> {
    const ids = new Set<string>(buildAnchorCatalog(report).keys())
    for (const id of taskIds) ids.add(`task:${id}`)
    return ids
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
      const inventory = this.buildInventory(puuid, config, report)
      const plan = await this.model.planDiscovery(question, inventory, this.chatModel)
      requests = plan.requests
      eventBus.emit({ type: 'telemetry.discovery.plan', question, requests })
    } catch (e) {
      eventBus.emit({
        type: 'telemetry.discovery.plan',
        question,
        requests: [],
        error: e instanceof Error ? e.message : String(e)
      })
      return [] // the chat must never break because discovery did
    }

    const enabled = new Set(config.sources.filter((s) => s.enabled).map((s) => s.id))
    const cap = config.budgetTier === 'deep' ? 5 : 3
    const honored = requests.filter((r) => enabled.has(SOURCE_FOR_KIND[r.kind])).slice(0, cap)

    // Each fetch reports what it went for and what actually came back — the
    // dossier lines below ARE what the coach model will see.
    const lines = await Promise.all(
      honored.map(async (r) => {
        const out = await this.fetchRequest(r, puuid, matchId, report)
        eventBus.emit({
          type: 'telemetry.discovery.fetch',
          kind: r.kind,
          source: SOURCE_FOR_KIND[r.kind],
          ok: out.length > 0,
          lines: out
        })
        return out
      })
    )
    return lines.flat()
  }

  /** One-line inventory of what discovery could fetch, from cheap local counts.
   * Each count is individually guarded — an unavailable store reads as 0. */
  private buildInventory(puuid: string, config: ResolvedCoachingConfig, report: MatchReport): string {
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
    const history = count(() => this.matchService.countMatches(puuid))
    const tasks = count(() => this.matchService.getStandingTasks(puuid).length)
    const opggOn = config.sources.some((s) => s.id === SOURCE_FOR_KIND.benchmark && s.enabled)
    const benchmark = opggOn ? 'available' : 'off'
    const championBuild = opggOn ? 'available' : 'off'
    const laneOpponent = report.matchup?.laneOpponent?.champion
    const laneMatchup = opggOn && laneOpponent ? `available(${laneOpponent})` : 'off'
    return `INVENTORY memory=${memory} history=${history} benchmark=${benchmark} champion_build=${championBuild} lane_matchup=${laneMatchup} tasks=${tasks}`
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
        const agg = await this.getHistoryAggregates.execute({ ...target, excludeMatchId: matchId })
        return agg ? [renderHistoryBlock(agg, target)] : []
      }
      if (request.kind === 'benchmark') {
        const bench = await this.benchmarkSource.getChampionBenchmark({
          champion: report.core.champion,
          role: report.core.role,
          tier: null
        })
        return bench
          ? [`BENCH cs_per_min basis=${bench.basis} ref=${bench.csPerMin}${bench.patch ? ` patch=${bench.patch}` : ''}`]
          : []
      }

      if (request.kind === 'champion_build') {
        const build = await this.insightsSource.getChampionBuild({
          champion: report.core.champion,
          role: report.core.role
        })
        if (!build) return []
        const parts = [
          `BUILD champ=${build.champion} pos=${build.position}`,
          build.patch ? `patch=${build.patch}` : '',
          `keystone="${build.keystone}"`,
          build.primaryTree ? `tree="${build.primaryTree}${build.secondaryTree ? `→${build.secondaryTree}` : ''}"` : '',
          build.coreItems.length ? `core="${build.coreItems.join(', ')}"` : '',
          build.startItems.length ? `start="${build.startItems.join(', ')}"` : '',
          build.summonerSpells?.length ? `spells="${build.summonerSpells.join(', ')}"` : '',
          build.skillOrder ? `skills="${build.skillOrder}"` : ''
        ].filter(Boolean)
        return [parts.join(' ')]
      }

      // lane_matchup — only useful when there is a lane opponent.
      const opponent = report.matchup?.laneOpponent?.champion
      if (!opponent) return []
      const matchup = await this.insightsSource.getLaneMatchup({
        champion: report.core.champion,
        role: report.core.role,
        opponent
      })
      if (!matchup) return []
      const lines: string[] = [
        `MATCHUP ${matchup.champion} vs ${matchup.opponent} ${matchup.position}${matchup.difficulty ? ` difficulty=${matchup.difficulty}` : ''}`
      ]
      for (const tip of matchup.tips) lines.push(`TIP "${tip}"`)
      if (matchup.counterItems?.length) lines.push(`COUNTER_ITEM "${matchup.counterItems.join('", "')}"`)
      return lines
    } catch {
      return []
    }
  }

  /**
   * Ground the transcript for the model: evidence-referenced turns get their
   * REF lines prepended (the fact behind the thing the player pointed at), and
   * turns carrying a RESOLVED proposal get a bracketed outcome line appended —
   * that is how Reject "informs the coach" (FR-005) with no side channel.
   */
  private groundTurns(
    report: MatchReport,
    standing: StandingFocusTask[],
    messages: ChatTurn[]
  ): ChatTurn[] {
    const render = makeRefLineRenderer(report, standing)
    return messages.map((m) => {
      let text = m.text
      if (m.refs?.length) {
        const lines = render(m.refs)
        if (lines.length) text = `${lines.join('\n')}\n\n${text}`
      }
      if (m.proposal) {
        const outcome =
          m.proposal.resolution === 'accepted'
            ? '[player accepted the proposal]'
            : m.proposal.resolution === 'rejected'
              ? '[player rejected the proposal]'
              : m.proposal.resolution === 'stale'
                ? '[the proposal went stale before the player could act]'
                : "[proposal awaiting the player's decision]"
        text = `${text}\n${outcome}`
      }
      return text === m.text ? m : { ...m, text }
    })
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
