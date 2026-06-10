import type {
  MatchAnalysis, AnalyzeMatchOptions, PassKey, SectionStatus, MatchReport,
  FramingOutput, NarrationOutput, ReviewOutput, TasksOutput, FocusTaskEval
} from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { SummonerRepository } from '../ports/SummonerRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { MatchCoachingModel, BenchmarkRef } from '../ports/MatchCoachingModel'
import type { BenchmarkDataSource } from '../ports/BenchmarkDataSource'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import type { CoachingConfigRepository } from '../ports/CoachingConfigRepository'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { buildAnchorCatalog, isValidStructuredRef, type AnchorCatalog } from '../../domain/report/anchorCatalog'
import { renderContextBlocks } from '../../domain/report/contextBlocks'
import { resolveConfig } from '../../domain/config/coachingConfig'
import { resolveGeneralBenchmark } from '../../domain/benchmark'
import { computeMetric, METRIC_KEYS } from '../../domain/report/metricRegistry'
import { evaluateTask } from '../../domain/report/taskEvaluation'
import { mergeStanding } from '../../domain/report/focusTask'

interface PassResult<T> {
  value: T | null
  status: SectionStatus
}

/**
 * Orchestrates the four-pass AI analysis for one match (spec 004). Loads the
 * factual report + anchor catalog from stored JSON (offline, Constitution VII),
 * then runs passes 1‖2 (light) → 3 → 4 (heavy), each guarded so a single failure
 * yields a partial read rather than sinking the whole analysis (FR-005). The
 * heavy passes consume the earlier passes' COMPACT outputs, never raw JSON
 * (FR-026). Re-running replaces the stored read; a partial never overwrites a
 * stored full read (FR-028, guarded in the repo).
 */
export class AnalyzeMatch {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly summonerRepo: SummonerRepository,
    private readonly reportRepo: ReportRepository,
    private readonly model: MatchCoachingModel,
    private readonly benchmarkSource: BenchmarkDataSource,
    private readonly goalRepo: SessionGoalRepository,
    private readonly coachingConfigRepo: CoachingConfigRepository,
    private readonly lightModel: string,
    private readonly heavyModel: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  async execute(matchId: string, opts: AnalyzeMatchOptions = {}): Promise<MatchAnalysis> {
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

    const report = assembleMatchReport(rawMatch, rawTimeline, account.puuid)
    const catalog = buildAnchorCatalog(report)

    // Resolve the coaching config once (FR — settings): a block feeds the model
    // only when it is enabled AND its required source (if any) is enabled.
    // alwaysOn blocks survive regardless (renderContextBlocks guarantees it).
    const config = resolveConfig(this.coachingConfigRepo.get())
    const disabledSources = new Set(config.sources.filter((s) => !s.enabled).map((s) => s.id))
    const enabledIds = new Set(
      config.blocks
        .filter((b) => b.enabled && !(b.requiresSource && disabledSources.has(b.requiresSource)))
        .map((b) => b.id)
    )

    // Stated-intent extras are gated here too, so a disabled goal/reflection
    // never leaks through the per-pass extras render paths either.
    const goal = enabledIds.has('player.goal')
      ? this.goalRepo.get()?.goal?.trim() || undefined
      : undefined
    const reflection = enabledIds.has('player.reflection')
      ? opts.reflection?.trim() || undefined
      : undefined
    const ctx = renderContextBlocks(report, catalog, { goal, reflection }, enabledIds)

    // Retry-fill: reuse a stored 'done' section unless forced.
    const existing = opts.force ? null : this.reportRepo.getMatchAnalysis(matchId)
    const reuse = <K extends PassKey>(k: K): MatchAnalysis[K] | undefined =>
      existing && existing.sections[k] === 'done' ? existing[k] : undefined

    // Passes 1 & 2 (light tier) — concurrent.
    const [framing, narration] = await Promise.all([
      this.runPass<FramingOutput>('framing', reuse('framing') as FramingOutput | undefined, () =>
        this.model.analyzeFraming(ctx, this.lightModel)
      ),
      report.timelineAvailable
        ? this.runPass<NarrationOutput>('narration', reuse('narration') as NarrationOutput | undefined, () =>
            this.model.analyzeNarration(ctx, this.lightModel)
          )
        : Promise.resolve<PassResult<NarrationOutput>>({ value: null, status: 'skipped' })
    ])

    // Pass 3 (heavy tier) — the prose verdict, fed compact outputs + benchmark + intent.
    const benchmark = await this.resolveBenchmark(
      account.puuid,
      report.core.champion,
      report.core.role,
      enabledIds.has('match.benchmark')
    )
    const review = await this.runPass<ReviewOutput>('review', reuse('review') as ReviewOutput | undefined, () =>
      this.model.analyzeReview(
        ctx,
        {
          framing: framing.value ? summarizeFraming(framing.value) : '',
          narration: narration.value ? summarizeNarration(narration.value) : '',
          benchmark,
          goal,
          reflection
        },
        this.heavyModel
      )
    )
    if (review.value) review.value.claims = dropOffCatalog(review.value.claims, catalog)

    // Pass 4 (heavy tier) — evaluate the standing set (deterministic) then have
    // the model hold/retire/add tasks.
    const tasks = await this.runTasks(account.puuid, matchId, report, ctx, goal, reuse('tasks') as TasksOutput | undefined)

    const sections: Record<PassKey, SectionStatus> = {
      framing: framing.status,
      narration: narration.status,
      review: review.status,
      tasks: tasks.status
    }
    const status = Object.values(sections).every((s) => s === 'done' || s === 'skipped') ? 'done' : 'partial'

    const analysis: MatchAnalysis = {
      matchId,
      result: report.core.win ? 'win' : 'loss',
      framing: framing.value,
      narration: narration.value,
      review: review.value,
      tasks: tasks.value,
      status,
      sections,
      lightModel: this.lightModel,
      heavyModel: this.heavyModel,
      generatedAt: this.now()
    }

    this.reportRepo.upsertMatchAnalysis(analysis)
    return analysis
  }

  /** Wrap a pass: reuse a stored result, or run it and catch failures (FR-005). */
  private async runPass<T>(
    _key: PassKey,
    reused: T | undefined,
    run: () => Promise<T>
  ): Promise<PassResult<T>> {
    if (reused !== undefined) return { value: reused, status: 'done' }
    try {
      return { value: await run(), status: 'done' }
    } catch {
      return { value: null, status: 'error' }
    }
  }

  /**
   * Resolve the OP.GG champion benchmark; fall back to the general per-rank ref.
   * With `useOpgg` false (source/block disabled in settings) the fetch is skipped
   * entirely and we degrade exactly as a failed fetch does: the general fallback.
   */
  private async resolveBenchmark(
    puuid: string,
    champion: string,
    role: string,
    useOpgg: boolean
  ): Promise<BenchmarkRef> {
    const tier = this.summonerRepo.getProfile(puuid)?.soloRank?.tier ?? null
    const champ = useOpgg
      ? await this.benchmarkSource.getChampionBenchmark({ champion, role, tier }).catch(() => null)
      : null
    if (champ) {
      return { metric: 'cs_per_min', basis: champ.basis, ref: champ.csPerMin, patch: champ.patch }
    }
    return { metric: 'cs_per_min', basis: 'general', ref: resolveGeneralBenchmark(tier).csPerMin }
  }

  /**
   * Pass 4 — the since-last loop. The evaluation is deterministic (metric
   * registry), so it stands even if the model fails; the model only adjusts the
   * standing set. A model failure marks the section error but keeps the (still
   * valid) since-last read and the current standing set.
   */
  private async runTasks(
    puuid: string,
    matchId: string,
    report: MatchReport,
    ctx: string,
    goal: string | undefined,
    reused: TasksOutput | undefined
  ): Promise<PassResult<TasksOutput>> {
    if (reused !== undefined) return { value: reused, status: 'done' }

    const standing = this.reportRepo.getStandingTasks(puuid)
    const firstTime = standing.length === 0
    const sinceLast: FocusTaskEval[] = standing.map((t) => evaluateTask(t, report))

    // Persist the evaluations (the per-game since-last record). sinceLast was
    // mapped from `standing`, so positions align 1:1 — index, never match by
    // description (the model writes those; duplicates are plausible).
    standing.forEach((t, i) => {
      this.reportRepo.insertTaskEvaluation({
        taskId: t.id,
        evaluatingMatchId: matchId,
        result: sinceLast[i]?.result ?? 'not_applicable',
        actualValue: computeMetric(t.metric, report)
      })
    })

    try {
      const proposal = await this.model.analyzeTasks(
        ctx,
        { standing, sinceLast, goal, catalogMetricKeys: METRIC_KEYS },
        this.heavyModel
      )
      const at = this.now()
      const newStanding = mergeStanding(proposal.set, standing, matchId, at)
      const keepIds = new Set(newStanding.map((t) => t.id))
      const toRetire = [
        ...standing.filter((s) => !keepIds.has(s.id)).map((s) => s.id),
        ...proposal.retire
      ]
      this.reportRepo.retireStandingTasks([...new Set(toRetire)], at)
      this.reportRepo.saveStandingTasks(puuid, newStanding, at)
      return { value: { standing: newStanding, sinceLast, firstTime }, status: 'done' }
    } catch {
      // Model failed — keep the current set, still surface the since-last read.
      return { value: { standing, sinceLast, firstTime }, status: 'error' }
    }
  }

}

function summarizeFraming(f: FramingOutput): string {
  const mvp = f.mvp ? ` mvp="${f.mvp.champion}${f.mvp.isYou ? ' (you)' : ''}"` : ''
  return `quick="${f.quickRead}"${mvp}`
}

function summarizeNarration(n: NarrationOutput): string {
  return n.turningPoints
    .slice(0, 3)
    .map((t) => `${t.time} ${t.swing}: ${t.what}`)
    .join(' | ')
}

function dropOffCatalog(claims: ReviewOutput['claims'], catalog: AnchorCatalog): ReviewOutput['claims'] {
  return claims.filter((c) => isValidStructuredRef(catalog, c.ref))
}
