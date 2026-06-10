// Frontend-first stub data (Constitution VIII, spec 005). Shapes mirror the
// `Reflection` DTO in `@shared/types` exactly, so wiring the backend is a
// stub→`window.api` swap in `useReflections` with no UI change. Fixtures cover
// the states the ReflectionsPanel must render: empty, player-only, mixed
// player+coach with evidence refs, and the at-cap state (composer hidden).
import type { Reflection } from '@shared/types'

const MATCH_ID = 'EUW1_7000000001'

/** Empty state → panel shows the "write your first takeaway" prompt. */
export const STUB_REFLECTIONS_EMPTY: Reflection[] = []

/** A single hand-written reflection, no refs. */
export const STUB_REFLECTIONS_PLAYER_ONLY: Reflection[] = [
  {
    id: `${MATCH_ID}-refl-m1a2b3-0`,
    matchId: MATCH_ID,
    text: 'I tilted off the first gank and started forcing plays. Next time I reset on the second wave instead of coin-flipping the river.',
    refs: [],
    source: 'player',
    createdAt: 1_749_551_000_000,
    updatedAt: 1_749_551_000_000
  }
]

/** Mixed: migrated legacy coach reflection, a coach one with refs (accepted via
 * chat), and a player one anchored to a timeline death + a standing task. */
export const STUB_REFLECTIONS_MIXED: Reflection[] = [
  {
    id: `${MATCH_ID}-refl-legacy`,
    matchId: MATCH_ID,
    text: 'I played the early game on my terms but gave the lead back twice by shoving without vision. The win came from grouping once we hit three items, not from my laning.',
    refs: [],
    source: 'coach',
    createdAt: 1_749_470_000_000,
    updatedAt: 1_749_470_000_000
  },
  {
    id: `${MATCH_ID}-refl-m4c5d6-0`,
    matchId: MATCH_ID,
    text: 'Both early deaths came right after I shoved with no river vision — shove only when the jungler is visible on the map.',
    refs: [
      { id: 'marker:death#1', kind: 'marker', label: 'Death 1 — 8:40' },
      { id: 'marker:death#2', kind: 'marker', label: 'Death 2 — 14:10' }
    ],
    source: 'coach',
    createdAt: 1_749_552_200_000,
    updatedAt: 1_749_552_200_000
  },
  {
    id: `${MATCH_ID}-refl-m7e8f9-0`,
    matchId: MATCH_ID,
    text: 'The vision task is finally automatic — buying the control ward on first back without thinking about it.',
    refs: [{ id: `task:${MATCH_ID}-task-b`, kind: 'task', label: 'End every game above 25 vision score' }],
    source: 'player',
    createdAt: 1_749_553_500_000,
    updatedAt: 1_749_554_100_000
  }
]

/** At the 20-per-match cap → composer hidden, list still renders. */
export const STUB_REFLECTIONS_AT_CAP: Reflection[] = Array.from({ length: 20 }, (_, i) => ({
  id: `${MATCH_ID}-refl-cap${i.toString(36)}-0`,
  matchId: MATCH_ID,
  text: `Takeaway number ${i + 1} — short note kept for cap-state layout testing.`,
  refs: [],
  source: i % 3 === 0 ? ('coach' as const) : ('player' as const),
  createdAt: 1_749_500_000_000 + i * 60_000,
  updatedAt: 1_749_500_000_000 + i * 60_000
}))

/** Toggle while building (Constitution VIII): swap which state the panel shows. */
export const STUB_REFLECTIONS: Reflection[] = STUB_REFLECTIONS_MIXED
