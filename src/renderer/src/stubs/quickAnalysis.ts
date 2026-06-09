// Frontend-first stub data (Constitution VIII). Shapes mirror the `SessionAnalysis`
// DTO in `@shared/types` exactly, so wiring the backend is a one-line swap in
// `useQuickAnalysis` with no UI change. These fixtures exercise every state the
// QuickAnalysis card must render.
import type { SessionAnalysis } from '@shared/types'

/** A normal result: 2–3 impact-ordered insights, mixed leaks, one with a
 *  benchmark basis, one provisional. */
export const STUB_SESSION_ANALYSIS: SessionAnalysis = {
  insights: [
    {
      leak: 'lead_conversion',
      headline: 'You win lane and lose the game',
      body: 'Your KDA holds up in the losses — the bleed is after 20 minutes, not in lane. Next game: when you hit 15 with a lead, group with your team and force a tower or drake instead of farming side for one more solo kill.',
      evidence: 'avgKDA 3.1 · 38% WR',
      benchmarkBasis: null,
      confidence: 'established'
    },
    {
      leak: 'deaths',
      headline: "You're feeding the games you lose",
      body: 'In your losses you die ~9 times; in your wins, ~3. That gap is the whole story — the deaths are avoidable, not the enemy outplaying you. Next game: hard rule — no solo deaths in the river without vision. Walk away from the greedy reset.',
      evidence: 'losses 8.7 dpg · wins 3.1',
      benchmarkBasis: 'rank_general',
      confidence: 'established'
    },
    {
      leak: 'farming',
      headline: 'Your CS quietly costs you an item',
      body: "At 6.4 CS/min on Ahri you're trailing the climbing reference for the pick this patch (~7.4). Over 30 minutes that's roughly a full item you never bought. Next game: target 8 CS/min — back to the wave after every recall and skirmish.",
      evidence: '6.4 vs ~7.4 CS/min',
      benchmarkBasis: 'champion_patch',
      confidence: 'provisional'
    }
  ],
  noData: false,
  benchmarkBasisUsed: 'champion_patch',
  generatedAt: 1_749_470_000_000,
  model: 'claude-sonnet-4-6'
}

/** Too few games to say anything useful → renderer shows the "needs games" state. */
export const STUB_SESSION_ANALYSIS_NO_DATA: SessionAnalysis = {
  insights: [],
  noData: true,
  benchmarkBasisUsed: 'general',
  generatedAt: 1_749_470_000_000,
  model: 'claude-sonnet-4-6'
}
