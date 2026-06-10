import type { MatchReport, MatchAnalysis } from '@shared/types'

// Pure briefing builder for the post-game coaching chat (spec 004). Mirrors the
// design prototype's `buildBriefing`: a compact, factual brief so Corky coaches
// off THIS game — its scoreline, Corky's verdict, the deaths, the swings, and the
// standing focus tasks — rather than generalities. No SDK, no IO; the adapter
// wraps this with the coach persona, the orchestrating command feeds it the data.

const DEATH_LABEL: Record<string, string> = {
  caught_out: 'caught out',
  overextended: 'overextended',
  fair_fight: 'a fair fight',
  objective_trade: 'traded for an objective',
  unclear: 'an unclear death'
}

function clock(durationSec: number): string {
  const m = Math.floor(durationSec / 60)
  const s = durationSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Build the factual briefing the chat runs against. `analysis` may be null (the
 * player can talk before analysing, though the UI gates the chat behind a read),
 * in which case only the hard facts are included. `goal` is the player's stated
 * Home-screen intent, surfaced so Corky can connect the game to what they're
 * working on.
 */
export function buildCoachBriefing(
  report: MatchReport,
  analysis: MatchAnalysis | null,
  goal?: string
): string {
  const c = report.core
  const facts: string[] = []
  facts.push(
    `Champion: ${c.champion} (${c.role}) · ${clock(c.durationSec)} · ${c.win ? 'VICTORY' : 'DEFEAT'}`
  )
  facts.push(
    `Line: ${c.kills}/${c.deaths}/${c.assists} KDA, ${c.cs} CS (${c.csPerMin.toFixed(1)}/min), ${c.gold} gold`
  )

  const review = analysis?.review
  if (review) {
    const gild = review.verdict.gild ? ` ${review.verdict.gild}` : ''
    facts.push(`Corky's verdict: ${review.verdict.lead}${gild}`)
    if (review.improve) facts.push(`The one thing to improve: ${review.improve}`)
  }

  const deaths = analysis?.narration?.deathNarrations ?? []
  if (deaths.length) {
    facts.push(
      'Deaths: ' +
        deaths.map((d) => `${DEATH_LABEL[d.character] ?? d.character} — ${d.text}`).join('; ')
    )
  }

  const turns = analysis?.narration?.turningPoints ?? []
  if (turns.length) {
    facts.push('Turning points: ' + turns.map((t) => `${t.time} (${t.swing}) — ${t.what}`).join('; '))
  }

  const tasks = analysis?.tasks?.standing ?? []
  if (tasks.length) {
    facts.push('Standing focus tasks: ' + tasks.map((t) => t.description).join('; '))
  }

  const lines = [
    'You are Corky, a sharp but warm League of Legends coach in a 1:1 with the player right after a ranked game.',
    'You have just shown them the post-game analysis and you are talking it through together.',
    'Style: conversational and concise — 2 to 4 sentences per reply, like a real coach, never an essay. Ask one focused question at a time. Reference the real facts of THIS game. Help them reach their own conclusions rather than lecturing. No markdown, no headers, no bullet lists.',
    '',
    'THIS GAME:',
    ...facts.map((f) => '- ' + f)
  ]
  if (goal && goal.trim()) {
    lines.push('', `The player is currently working on: ${goal.trim()}`)
  }
  return lines.join('\n')
}
