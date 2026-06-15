import type { MatchReport, MatchAnalysis, RosterEntry } from '@shared/types'
import { summonerSpellName, keystoneName, runeTreeName } from './loadoutGlossary'

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
  analysis?: MatchAnalysis,
  goal?: string,
  itemNames?: ReadonlyMap<number, string> | null
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

  // Team matchup. Loadout facts are rendered as WORDS — the model coaches off
  // names, not Riot's numeric ids. Spells/keystone/trees resolve from the
  // static glossary; item names from the caller-supplied Data Dragon catalog
  // (absent offline, in which case the items line degrades to annotated ids).
  const mu = report.matchup
  if (mu) {
    if (mu.laneOpponent) {
      const o = mu.laneOpponent
      facts.push(`Lane opponent: ${o.champion} — ${o.kills}/${o.deaths}/${o.assists} KDA, ${o.cs} CS`)
    }
    const fmtEntry = (e: RosterEntry): string =>
      e.isYou ? `${e.champion}/${e.role}[YOU]` : e.isLaneOpponent ? `${e.champion}/${e.role}[OPP]` : `${e.champion}/${e.role}`
    if (mu.allies.length) facts.push(`Your team: ${mu.allies.map(fmtEntry).join(' · ')}`)
    if (mu.enemies.length) facts.push(`Enemy team: ${mu.enemies.map(fmtEntry).join(' · ')}`)

    const spells = mu.you.summonerSpellIds
      .filter((id) => id > 0)
      .map((id) => summonerSpellName(id) ?? `spell ${id}`)
    if (spells.length) facts.push(`Your summoner spells: ${spells.join(' + ')}`)

    const items = mu.you.itemIds.filter((id) => id > 0)
    if (items.length) {
      if (itemNames) {
        const named = items.map((id) => itemNames.get(id) ?? `unknown item ${id}`)
        const trinket = mu.you.trinketId > 0 ? itemNames.get(mu.you.trinketId) : null
        facts.push(`Your items: ${named.join(', ')}${trinket ? ` · trinket: ${trinket}` : ''}`)
      } else {
        // Item-name glossary unavailable (offline). Raw ids MUST NOT reach the
        // model: it will confidently "decode" them into wrong item names.
        facts.push(
          'Your items: names unavailable right now — NEVER guess or name specific items from this game; if asked about the build, ask the player what they built.'
        )
      }
    }

    const runeParts: string[] = []
    if (mu.you.keystoneId) {
      runeParts.push(`keystone ${keystoneName(mu.you.keystoneId) ?? `id ${mu.you.keystoneId}`}`)
    }
    if (mu.you.primaryStyleId) {
      runeParts.push(`${runeTreeName(mu.you.primaryStyleId) ?? `tree id ${mu.you.primaryStyleId}`} primary`)
    }
    if (mu.you.subStyleId) {
      runeParts.push(`${runeTreeName(mu.you.subStyleId) ?? `tree id ${mu.you.subStyleId}`} secondary`)
    }
    if (runeParts.length) facts.push(`Your runes: ${runeParts.join(', ')}`)
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
