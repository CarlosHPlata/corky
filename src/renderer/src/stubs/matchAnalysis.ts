import type { MatchAnalysis } from '@shared/types'

// Constitution VIII — stub data mirroring the MatchAnalysis DTO exactly, so the
// renderer's "Corky's read" sections can be built and reviewed before the IPC
// wiring. The production path uses useMatchAnalysis(); these are for review and
// Storybook-style state checks (win / loss / partial / no-timeline / first-game).

export const STUB_ANALYSIS_LOSS: MatchAnalysis = {
  matchId: 'EUW1_LOSS_002',
  result: 'loss',
  framing: {
    headlineTag: 'Baron 24:40',
    headlineTagIntent: 'objective',
    quickRead: 'Even until 24, then you threw it in the river.',
    mvp: { champion: 'Zed', isYou: false, teamId: 200, justification: '12/2/8 — carried the mid-game on the enemy side.' },
    matchupTips: ['Zed punishes sidewave shoves — track his ult cooldown before stepping up.'],
    captions: { titleBar: 'Defeat · 31:24' }
  },
  narration: {
    highlightNarrations: [
      { ref: { id: 'marker:objective#1', kind: 'marker' }, text: 'You took the first drake uncontested — a clean early lead.' }
    ],
    deathNarrations: [
      { ref: { id: 'marker:death#2', kind: 'marker' }, character: 'caught_out', text: 'Alone in the river with no vision before Baron.' }
    ],
    turningPoints: [
      {
        time: '22:10', swing: '−1.6k swing', dir: 'down',
        you: { x: 24, y: 30 }, event: { x: 62, y: 60 },
        what: 'First solo river death handed the enemy mid a reset and Herald.',
        better: 'Recall on the lead at 21:30 — nothing to do alone in the bottom river.'
      }
    ]
  },
  review: {
    verdict: { lead: 'Even game until 24 minutes.', gild: 'You lost it walking into the river alone before Baron — twice.' },
    improve: 'Stop roaming the river alone with a lead — recall and group by 24:00 so you can actually contest Baron.',
    claims: [
      { text: 'You were +310 at 14 but −1240 by 24.', ref: { id: 'stat:gold_at_24', kind: 'stat' } },
      { text: 'Two solo deaths gave up the swing.', ref: { id: 'stat:solo_deaths', kind: 'stat' } }
    ],
    cohort: 'vs Ahri mid meta (patch 14.10)',
    benchmarkBasis: 'champion_patch',
    confidence: 'established'
  },
  tasks: {
    standing: [
      { id: 't1', description: "Don't die alone in the river.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal', status: 'active', sourceMatchId: 'EUW1_LOSS_002' }
    ],
    sinceLast: [
      { description: 'Hit 70 CS by 10 minutes.', metric: 'cs_at_10', comparator: '>=', target: '70', scope: 'role', actual: '74', result: 'improved' }
    ],
    firstTime: false
  },
  status: 'done',
  sections: { framing: 'done', narration: 'done', review: 'done', tasks: 'done' },
  lightModel: 'claude-haiku-4-5',
  heavyModel: 'claude-opus-4-8',
  generatedAt: 1_700_000_000_000
}

/** MVP slice: only the heavy verdict is built; the decoration/narration/tasks
 * passes error until their stories land (FR-005 partial state). */
export const STUB_ANALYSIS_PARTIAL: MatchAnalysis = {
  ...STUB_ANALYSIS_LOSS,
  framing: null,
  narration: null,
  tasks: null,
  status: 'partial',
  sections: { framing: 'error', narration: 'error', review: 'done', tasks: 'error' }
}

/** Timeline absent → narration skipped; the verdict still works from core stats. */
export const STUB_ANALYSIS_NO_TIMELINE: MatchAnalysis = {
  ...STUB_ANALYSIS_LOSS,
  narration: null,
  status: 'done',
  sections: { framing: 'done', narration: 'skipped', review: 'done', tasks: 'done' }
}
