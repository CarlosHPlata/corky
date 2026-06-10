export interface Account {
  puuid: string
  gameName: string
  tagLine: string
  platform: string
  region: string
}

export interface MatchSummary {
  matchId: string
  puuid: string
  queue: number
  champion: string
  role: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  csPerMin: number
  gold: number
  goldPerMin: number
  gameCreation: number
  gameDuration: number
}

/** Request for one infinite-scroll page of the match list (spec 003 / US1). */
export interface MatchPageRequest {
  /** Opaque cursor from a previous page's `nextCursor`; omitted/null ⇒ first page. */
  before?: string | null
  /** Page size; defaults to 20, clamped 1..50 in the query. */
  limit?: number
}

/** One page of the match list. */
export interface MatchPage {
  /** Newest-first within the page. */
  matches: MatchSummary[]
  /** Opaque cursor for the next (older) page; null ⇒ local store exhausted. */
  nextCursor: string | null
  /** Hint that Riot may hold older games not yet stored locally. */
  hasMoreRemote: boolean
}

/** A participant line in the matchup roster. */
export interface RosterEntry {
  champion: string
  role: string
  teamId: number
  isYou: boolean
  isLaneOpponent: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  gold: number
}

/** Who the player faced — lanes for one game. */
export interface Matchup {
  you: RosterEntry
  /** null ⇒ no single opposed lane (jungle/roam, or a non-lane mode). */
  laneOpponent: RosterEntry | null
  /** 5 entries incl. you, role-ordered TOP→SUP. */
  allies: RosterEntry[]
  /** 5 entries, role-ordered. */
  enemies: RosterEntry[]
}

/** The headline economy line for the player's game. */
export interface MatchCore {
  champion: string
  role: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  kdaRatio: number
  cs: number
  csPerMin: number
  gold: number
  goldPerMin: number
  durationSec: number
  queue: number
}

/** The decided-by-numbers block. `null` ⇒ "not reached", never substituted with 0. */
export interface Breakdown {
  csAt10: number | null
  csPerMin: number
  goldAt14: number | null
  goldAt24: number | null
  visionScore: number
  soloDeaths: number
  /** 0–1 fraction; renderer formats as %. */
  killParticipation: number
}

/** One sampled point of the team gold-difference curve (player-team positive). */
export interface GoldFrame {
  tMin: number
  /** Raw gold; renderer may scale to thousands. */
  goldDiff: number
}

/** A data-inferred timeline moment (deterministic; never AI-written). */
export interface Highlight {
  tMin: number
  kind: 'objective' | 'teamfight' | 'death'
  /** Factual label, e.g. "Baron — Blue", "Team wiped 4–1", "Death → −1.6k". */
  label: string
  /** Short factual elaboration; no coaching. */
  detail?: string
  /** Which side benefited; 'neutral' when even. */
  side: 'ally' | 'enemy' | 'neutral'
}

/** The gold-difference timeline + its highlights (US3). */
export interface GoldTimeline {
  frames: GoldFrame[]
  endMin: number
  highlights: Highlight[]
}

/** One of the player's deaths, positioned on the map (US4). */
export interface DeathMarker {
  /** 1-based order across the game. */
  n: number
  tMin: number
  /** 0–100, normalized to the map (Y inverted for screen space). */
  xPct: number
  yPct: number
}

/** The player's death locations for one game. */
export interface DeathMap {
  deaths: DeathMarker[]
  /** == deaths.length. */
  count: number
}

/** The full FACTUAL match report (no LLM). `timeline`/`deathMap` null when timeline JSON absent. */
export interface MatchReport {
  matchId: string
  core: MatchCore
  matchup: Matchup
  breakdown: Breakdown
  timeline: GoldTimeline | null
  deathMap: DeathMap | null
  /** false ⇒ render the "not available for this game" note (FR-025). */
  timelineAvailable: boolean
}

export interface MatchDetail {
  matchId: string
  rawJson: string
}

export interface Timeline {
  matchId: string
  rawJson: string
}

export interface RankInfo {
  queueType: string
  tier: string
  division: string
  leaguePoints: number
  wins: number
  losses: number
}

export interface SummonerProfile {
  puuid: string
  gameName: string
  tagLine: string
  platform: string
  region: string
  profileIconId: number
  summonerLevel: number
  soloRank: RankInfo | null
}

export interface LpSnapshot {
  ts: number
  tier: string
  division: string
  leaguePoints: number
}

export interface CoachReport {
  id: number
  matchId: string
  createdAt: number
  model: string
  content: string
}

export interface FocusTask {
  id: string
  matchId: string
  description: string
  metric: string
  comparator: '>=' | '<=' | '==' | '>' | '<'
  target: number
  scope: 'champion' | 'role' | 'universal'
  champion?: string
  role?: string
}

export type TaskEvaluationResult = 'improved' | 'held' | 'regressed' | 'not_applicable'

export interface TaskEvaluation {
  taskId: string
  evaluatingMatchId: string
  result: TaskEvaluationResult
  actualValue: number | null
}

/** Category of flaw a Quick Analysis insight diagnoses — drives the renderer icon/tone. */
export type InsightLeak =
  | 'deaths'
  | 'farming'
  | 'lead_conversion'
  | 'champion_pool'
  | 'consistency'
  | 'tempo'

/** What reference a cited benchmark was measured against (honest about its basis). */
export type BenchmarkBasis = 'champion_patch' | 'rank_general' | 'general'

/** One unit of session coaching — maps onto a Quick Analysis insight row. */
export interface SessionInsight {
  leak: InsightLeak
  /** The flaw, blunt and short. */
  headline: string
  /** Why it costs LP at this rank + the concrete next-game action. */
  body: string
  /** Chip text drawn from computed signals, e.g. "avgKDA 3.1 · 38% WR". */
  evidence: string
  /** Reference basis when a benchmark is cited; null when none applies. */
  benchmarkBasis: BenchmarkBasis | null
  /** `provisional` when the pattern rests on fewer than 3 games. */
  confidence: 'established' | 'provisional'
}

/** The full Quick Analysis result returned to the renderer (ephemeral, session-cached). */
export interface SessionAnalysis {
  /** 0–4 insights, target 2–3, impact-ordered. Empty when `noData`. */
  insights: SessionInsight[]
  /** true when there are too few games to analyze → renderer shows "needs games". */
  noData: boolean
  /** Overall benchmark basis actually used for this run (transparency). */
  benchmarkBasisUsed: BenchmarkBasis
  /** epoch ms, stamped in the main process. */
  generatedAt: number
  /** model id used (provenance). */
  model: string
}

/** The player's session goal + notes, fed to the coach as stated intent. */
export interface SessionGoal {
  /** Short single focus statement. Trimmed, ≤ 200 chars. '' when unset. */
  goal: string
  /** Free-form, multi-line notes. Trimmed, ≤ 1000 chars. '' when unset. */
  notes: string
  /** epoch ms of the last save; null when never set. */
  updatedAt: number | null
}

/** What the renderer submits when saving; the main process trims + caps it. */
export interface SessionGoalInput {
  goal: string
  notes: string
}

// ───────────────────────────────────────────────────────────────────────────
// AI Match Analysis — "Corky's read" (spec 004). The interpretive half of the
// match report, produced by four cooperating passes, each owning its own
// section. Field names map onto the renderer's existing report components.
// ───────────────────────────────────────────────────────────────────────────

/** A metric the extraction engine can compute (focus tasks must use one of these). */
export type MetricKey =
  | 'cs_at_10'
  | 'cs_per_min'
  | 'gold_at_14'
  | 'gold_at_24'
  | 'vision_score'
  | 'solo_deaths'
  | 'kill_participation'
  | 'deaths'

/** A claim's evidence anchor. Structured kinds (`stat`/`marker`) must cite an id
 * present in the computed anchor catalog; `benchmark`/`note` are typed chips.
 * `task` refs (spec 005) cite a standing focus task (`task:<taskId>`) and are
 * resolved against the standing set, not the anchor catalog. */
export interface EvidenceRef {
  id: string
  kind: 'stat' | 'marker' | 'benchmark' | 'note' | 'task'
  label?: string
}

/** A point on the minimap, 0–100 normalized (matches the renderer's Pos). */
export interface MapPos {
  x: number
  y: number
}

/** Which pass produced a section, and whether it succeeded. */
export type PassKey = 'framing' | 'narration' | 'review' | 'tasks'
export type SectionStatus = 'done' | 'error' | 'skipped'

/** Pass 1 — the decoration layer (MVP-style label, tips, headline, quick read). */
export interface FramingOutput {
  headlineTag: string
  headlineTagIntent: 'win' | 'loss' | 'objective' | 'accent' | 'warn' | 'info' | 'neutral'
  quickRead: string
  /** null on a degenerate game (remake/AFK) — never invented. */
  mvp: { champion: string; isYou: boolean; teamId: number; justification: string } | null
  matchupTips: string[]
  /** Optional UX-defined slot→caption map (title-bar text, section spans). */
  captions?: Record<string, string>
}

/** A short factual narration attached to a spec-003 timeline highlight. */
export interface HighlightNarration {
  ref: EvidenceRef
  text: string
}

/** How a player death read (character), with a short factual line. */
export interface DeathNarration {
  ref: EvidenceRef
  character: 'caught_out' | 'overextended' | 'fair_fight' | 'objective_trade' | 'unclear'
  text: string
}

/** A selected swing on the timeline (maps to the TurningPoint component). */
export interface TurningPoint {
  time: string
  swing: string
  dir: 'up' | 'down'
  you: MapPos
  event: MapPos
  objective?: MapPos
  what: string
  better: string
}

/** Pass 2 — highlight & death narration + the chosen turning points. */
export interface NarrationOutput {
  highlightNarrations: HighlightNarration[]
  deathNarrations: DeathNarration[]
  turningPoints: TurningPoint[]
}

/** One structured claim inside the prose verdict, anchored to evidence. */
export interface ReviewClaim {
  text: string
  ref: EvidenceRef
}

/** Pass 3 — the prose verdict (its own section). */
export interface ReviewOutput {
  /** Prose, delivered as two parts to fit the VerdictCard. */
  verdict: { lead: string; gild: string }
  /** One or two sentences on the single most important thing to change next game. */
  improve: string
  claims: ReviewClaim[]
  /** Badge label for the basis actually used, e.g. "vs Ahri mid meta (patch)". */
  cohort: string
  benchmarkBasis: BenchmarkBasis
  confidence: 'established' | 'provisional'
}

/** A standing, global, per-user focus task (1–3 held at a time). */
export interface StandingFocusTask {
  id: string
  description: string
  metric: MetricKey
  comparator: '>=' | '<=' | '==' | '>' | '<'
  target: number
  scope: 'champion' | 'role' | 'universal'
  champion?: string
  role?: string
  status: 'active' | 'retired'
  sourceMatchId: string
}

/** A standing task evaluated against one game (maps to the FocusTask component). */
export interface FocusTaskEval {
  description: string
  metric: MetricKey
  comparator: string
  target: string
  scope: string
  actual?: string
  result: 'improved' | 'held' | 'regressed' | 'not_applicable'
}

/** One standing task's recent track record — a per-task row of the Home
 * Progress card. Deterministic: built straight from stored evaluations. */
export interface TaskProgress {
  taskId: string
  description: string
  metric: string
  /** newest-first results of the last evaluations, max 5 */
  recent: TaskEvaluationResult[]
  /** consecutive most-recent 'improved' or 'held' results */
  streak: number
}

/** The player's coaching progress at a glance (Home) — how the focus-task loop
 * is closing. Zero-LLM: standing-task track records plus what the semantic
 * memory says Corky is still tracking and has already closed out. */
export interface ProgressSummary {
  tasks: TaskProgress[]
  /** active patterns/weaknesses the coach is tracking, occurrences-descending, max 4 */
  working: { statement: string; kind: string; occurrences: number }[]
  /** resolved objects + milestones, newest-first, max 4 */
  wins: { statement: string; kind: string }[]
  /** total analysed games with a stored read */
  analysedGames: number
}

/** Pass 4 — focus tasks + the since-last loop. */
export interface TasksOutput {
  standing: StandingFocusTask[]
  sinceLast: FocusTaskEval[]
  /** true when no standing set existed before (clean since-last state). */
  firstTime: boolean
}

/** The full interpretive read for one game, assembled from the four passes and
 * persisted per match. Restored on report open with no model call (FR-027). */
export interface MatchAnalysis {
  matchId: string
  result: 'win' | 'loss'
  framing: FramingOutput | null
  narration: NarrationOutput | null
  review: ReviewOutput | null
  tasks: TasksOutput | null
  status: 'done' | 'partial'
  sections: Record<PassKey, SectionStatus>
  lightModel: string
  heavyModel: string
  generatedAt: number
}

/** Options for re-running an analysis. */
export interface AnalyzeMatchOptions {
  /** Re-run every pass, replacing the stored read (FR-028). */
  force?: boolean
  /** The player's per-match reflection note (renderer-local), as stated intent. */
  reflection?: string
}

/** One turn of the post-game coaching chat (spec 004). The renderer holds the
 * transcript locally; the main process rebuilds context per call from the stored
 * match + analysis, so secrets never cross preload (Constitution VI). */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  /** Evidence anchors the player attached to this message from the report
   * (timeline markers, deaths, stats); grounded to facts in the main process. */
  refs?: EvidenceRef[]
  /** A confirm-first action proposal embedded in this (assistant) turn (spec 005).
   * Persisted with the transcript so pending cards survive restarts. */
  proposal?: ActionProposal
}

/** Corky's reply to a single chat turn. */
export interface CoachChatReply {
  reply: string
  /** Present when this turn minted a (sanitised, pending) proposal. The renderer
   * appends this turn instead of building its own assistant turn (spec 005). */
  proposalTurn?: ChatTurn
}

// ───────────────────────────────────────────────────────────────────────────
// Agentic coach chat (spec 005) — confirm-first proposals, first-class
// reflections, multiple chat sessions per match.
// ───────────────────────────────────────────────────────────────────────────

/** Who authored a reflection: the player by hand, or Corky via accepted proposal. */
export type ReflectionSource = 'player' | 'coach'

/** A durable takeaway about one match. Many per match; refs are report anchors
 * or `task:` ids. Input to memory distillation, never a memory row itself. */
export interface Reflection {
  id: string
  matchId: string
  text: string
  refs: EvidenceRef[]
  source: ReflectionSource
  createdAt: number
  updatedAt: number
}

/** What the renderer submits when saving a reflection manually. `id` absent ⇒
 * create; present ⇒ edit. The main process trims, caps and filters refs. */
export interface SaveReflectionInput {
  matchId: string
  id?: string
  text: string
  refs: EvidenceRef[]
}

/** Listing entry for one coaching chat session of a match. */
export interface ChatSessionMeta {
  id: string
  matchId: string
  title: string
  createdAt: number
  updatedAt: number
}

/** A full session: meta + its transcript (incl. embedded proposals). */
export interface ChatSession extends ChatSessionMeta {
  turns: ChatTurn[]
}

/** A proposal resolves exactly once: pending → accepted | rejected | stale. */
export type ProposalResolution = 'pending' | 'accepted' | 'rejected' | 'stale'

/** The validated payload of a coach proposal. Persisted post-sanitisation only —
 * a stored proposal is always acceptable modulo staleness. */
export type ProposalPayload =
  | {
      kind: 'update_tasks'
      /** The FULL resulting standing set (1–3), already validated. */
      set: StandingFocusTask[]
      /** Explicit retires (subset of the standing set at proposal time). */
      retireIds: string[]
      /** Shape signature of the standing set at proposal time (stale check). */
      baseline: string
    }
  | { kind: 'create_reflection'; text: string; refs: EvidenceRef[] }
  | {
      kind: 'update_reflection'
      reflectionId: string
      text: string
      refs: EvidenceRef[]
      /** Target reflection's updatedAt at proposal time (stale check). */
      baseline: number
    }
  | { kind: 'delete_reflection'; reflectionId: string; baseline: number }

/** A coach-suggested state change awaiting the player's decision, embedded in
 * the assistant turn that delivered it. Nothing persists until accepted. */
export interface ActionProposal {
  id: string
  payload: ProposalPayload
  resolution: ProposalResolution
  resolvedAt?: number
}

/** The renderer's accept/reject decision on one proposal. */
export interface ResolveProposalInput {
  matchId: string
  sessionId: string
  proposalId: string
  decision: 'accept' | 'reject'
}

/** Outcome of resolving a proposal. Idempotent: re-resolving returns the
 * recorded outcome unchanged. */
export interface ResolveProposalOutcome {
  /** Never 'pending'. 'stale' ⇒ nothing was applied. */
  resolution: ProposalResolution
  /** Patched stored analysis when a task accept changed the Next-game focus;
   * lets the report re-render without a re-analyse. Null otherwise. */
  analysis: MatchAnalysis | null
  /** The saved/updated reflection on reflection accepts; null otherwise. */
  reflection: Reflection | null
}

export interface IpcApi {
  /** `start` fetches an older Riot window (match-v5 offset) for infinite scroll. */
  syncMatches: (count: number, start?: number) => Promise<void>
  getMatchList: () => Promise<MatchSummary[]>
  /** One infinite-scroll page of the match list (US1). */
  getMatchPage: (req: MatchPageRequest) => Promise<MatchPage>
  /** The factual, computed report for one match, or null if not stored (US2–US4). */
  getMatchReport: (matchId: string) => Promise<MatchReport | null>
  syncProfile: () => Promise<void>
  getSummonerProfile: () => Promise<SummonerProfile | null>
  getLpHistory: () => Promise<LpSnapshot[]>
  /** Run the four-pass AI analysis for a match; returns the assembled read (spec 004). */
  analyzeMatch: (matchId: string, opts?: AnalyzeMatchOptions) => Promise<MatchAnalysis>
  /** Restore the stored analysis for a match (no model call), or null if never run. */
  getMatchAnalysis: (matchId: string) => Promise<MatchAnalysis | null>
  /** Send one session's transcript to Corky and get his next coaching reply.
   * Context (this game's facts + Corky's read + reflections) is rebuilt in the
   * main process. May carry a confirm-first proposal turn (spec 005). */
  coachChat: (matchId: string, sessionId: string, messages: ChatTurn[]) => Promise<CoachChatReply>
  /** Resolve one embedded proposal exactly once: accept applies it (validated
   * against current state — may come back 'stale'), reject discards (spec 005). */
  resolveProposal: (input: ResolveProposalInput) => Promise<ResolveProposalOutcome>
  /** This match's reflections, oldest first (spec 005). */
  listReflections: (matchId: string) => Promise<Reflection[]>
  /** Create (id absent) or edit (id present) a reflection manually — no model
   * call; the server trims, caps and filters refs (spec 005). */
  saveReflection: (input: SaveReflectionInput) => Promise<Reflection>
  /** Hard-delete one reflection; deleting a missing id is a no-op (spec 005). */
  deleteReflection: (matchId: string, reflectionId: string) => Promise<void>
  /** Summarize the session into a reflection: a standard create_reflection
   * proposal turn comes back — nothing persists until accepted (spec 005). */
  summarizeIntoReflection: (matchId: string, sessionId: string, messages: ChatTurn[]) => Promise<CoachChatReply>
  /** The player's current standing focus tasks (global, 1–3). Empty until the
   * first game is analysed. Drives the Home "Next-game focus" card. */
  getStandingTasks: () => Promise<StandingFocusTask[]>
  /** Deterministic read of coaching progress — per-task evaluation track
   * records, what Corky is working on, and banked wins. No model call;
   * drives the Home "Progress" card. */
  getProgress: () => Promise<ProgressSummary>
  /** Switcher listing of a match's chat sessions, newest first (spec 005). */
  listChatSessions: (matchId: string) => Promise<ChatSessionMeta[]>
  /** One full session (turns incl. proposals), or null when missing/unreadable. */
  getChatSession: (sessionId: string) => Promise<ChatSession | null>
  /** Upsert one session's transcript. Lazy creation: first call creates the row
   * (server stamps the title); resolutions embedded in turns are read-only. */
  saveChatSession: (matchId: string, sessionId: string, turns: ChatTurn[]) => Promise<ChatSessionMeta>
  getCoachReport: (matchId: string) => Promise<CoachReport | null>
  /** Generate a fresh analysis and persist it as the account's latest. */
  runSessionAnalysis: () => Promise<SessionAnalysis>
  /** The last persisted analysis for the current account, or null if none yet. */
  getSessionAnalysis: () => Promise<SessionAnalysis | null>
  /** The saved session goal + notes, or null if never set. */
  getSessionGoal: () => Promise<SessionGoal | null>
  /** Persist the goal + notes (server trims + caps); returns the stored record. */
  saveSessionGoal: (input: SessionGoalInput) => Promise<SessionGoal>
  /** The effective coaching config: registry metadata merged with stored overrides. */
  getCoachingConfig: () => Promise<import('./config').ResolvedCoachingConfig>
  /** Persist the desired source/block/tier state (stored as a diff from defaults). */
  saveCoachingConfig: (
    input: import('./config').SaveCoachingConfigInput
  ) => Promise<import('./config').ResolvedCoachingConfig>
  /** Drop every override — sources, blocks and tier back to install defaults. */
  restoreCoachingConfigDefaults: () => Promise<import('./config').ResolvedCoachingConfig>
}
