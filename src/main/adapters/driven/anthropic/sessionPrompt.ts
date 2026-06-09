import type { SessionFeatures, PoolEntry, GameLine } from '../../../domain/sessionFeatures'
import type { PlayerContext } from '../../../application/ports/SessionCoachingModel'

/**
 * Forced tool the model must call. input_schema mirrors
 * specs/.../contracts/llm-output.schema.json — the renderer's SessionInsight shape.
 */
export const SUBMIT_TOOL = {
  name: 'submit_analysis',
  description:
    'Return the Quick Analysis result. You only annotate the pre-computed facts provided — never invent numbers.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['insights', 'noData'],
    properties: {
      noData: {
        type: 'boolean',
        description: 'true only when there are too few games to say anything useful; insights must then be empty.'
      },
      insights: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['leak', 'headline', 'body', 'evidence', 'confidence'],
          properties: {
            leak: {
              type: 'string',
              enum: ['deaths', 'farming', 'lead_conversion', 'champion_pool', 'consistency', 'tempo']
            },
            headline: { type: 'string', description: 'The flaw, blunt and short.' },
            body: { type: 'string', description: 'Why it costs LP at this rank + the concrete next-game action.' },
            evidence: {
              type: 'string',
              description: "Chip text echoing a number from the facts, e.g. 'avgKDA 3.1 · 38% WR'."
            },
            benchmarkBasis: {
              type: ['string', 'null'],
              enum: ['champion_patch', 'rank_general', 'general', null],
              description: 'Set when a rate benchmark is cited; null otherwise.'
            },
            confidence: {
              type: 'string',
              enum: ['established', 'provisional'],
              description: 'provisional when the pattern rests on fewer than 3 games.'
            }
          }
        }
      }
    }
  }
}

const SYSTEM = `You are Corky, a League of Legends coach in the mold of a high-elo (T1-caliber) analyst doing a quick read of a lower-elo player's recent account. You are blunt, direct, and respect the player enough to tell them the truth — they want to climb, not be comforted.

Your job: from the patterns ACROSS their recent games, name the 1-3 habits that are costing them the most LP — ranked by impact for THEIR rank — and tell them exactly what to do next game. Call submit_analysis with the result.

Hard rules:
- Diagnose, don't describe. NEVER state a fact they can already see on their dashboard ("your most-played champ is X", "your win rate is Y%", "you went N-M"). A visible number may ONLY appear inside the "evidence" field as support for a non-obvious diagnosis.
- Every insight = the flaw + why it loses games at THIS rank + ONE concrete next-game action.
- Prioritize ruthlessly. Lead with the keystone leak. 2-3 sharp insights beat a list of 4 weak ones.
- Cite only the numbers provided below. Never invent figures or benchmarks. The "evidence" string must echo a value you were given.
- This is an aggregate read — you do NOT have per-game timelines. If a leak needs frame-level detail (exactly where they died), say so in the body and point them to the full post-game report instead of inventing specifics.
- If a pattern rests on fewer than 3 games, mark that insight "provisional" and say it's promising, not proven.
- When you cite a rate benchmark (CS/min, deaths), set benchmarkBasis to the basis given in the facts.
- If a heavily-played champion's current meta standing is weak (low win rate / low tier in the facts), you MAY raise ONE 'champion_pool' insight framing it as context for the player's own decision — never a generic tier list, never the headline if a bigger gameplay leak exists.
- Voice: a coach who's seen ten thousand of these accounts. Plain, sharp, a little hard.
- If there are too few games to find a real pattern, return noData=true with an empty insights array rather than guessing.`

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function poolLine(p: PoolEntry): string {
  const meta = p.metaStanding
    ? ` [meta: ${p.metaStanding.tier}-tier, ${pct(p.metaStanding.winRate)} WR, patch ${p.metaStanding.patch}]`
    : ''
  return `  - ${p.champion} (${p.role}): ${p.games} games, ${p.wins}W-${p.games - p.wins}L, ${pct(p.winRate)} WR, ${p.avgKda} KDA, ${p.avgCsPerMin} CS/min${meta}`
}

function gameLine(g: GameLine): string {
  return `  - ${g.champion} ${g.role} ${g.win ? 'W' : 'L'} ${g.kills}/${g.deaths}/${g.assists}, ${g.csPerMin} CS/min, ${g.durationMin}min`
}

/**
 * The player's own goal/notes, rendered as a labelled intent block — only when
 * non-empty. Explicitly framed as intent (not a computed fact) with guardrails
 * so the model weaves it in without citing it as evidence or inventing figures.
 */
function intentBlock(ctx?: PlayerContext): string {
  if (!ctx) return ''
  const goal = ctx.goal.trim()
  const notes = ctx.notes.trim()
  if (!goal && !notes) return ''
  const noteLines = notes
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `    - ${s}`)
    .join('\n')
  const goalLine = goal ? `  Goal: ${goal}` : '  Goal: (none set)'
  const notesPart = noteLines ? `\n  Notes:\n${noteLines}` : ''
  return `

The player has set their own goal & notes for this session — their stated intent, in their own words (this is NOT a computed fact):
${goalLine}${notesPart}
Treat this as the player's intent. Where the numbers above support it, speak to it directly and make the read about what they're working on. Do NOT put this text in an "evidence" chip, and do NOT invent any figure to make a leak fit the goal. If the data can't speak to their goal, say so plainly.`
}

/**
 * Serialize the computed facts into a labeled prompt. The model reasons over
 * these numbers only; it must not introduce figures of its own.
 */
export function buildSessionPrompt(
  f: SessionFeatures,
  playerContext?: PlayerContext
): { system: string; user: string } {
  const rank = f.rank ? `${f.rank.tier} ${f.rank.division} ${f.rank.leaguePoints} LP` : 'Unranked/unknown'
  const lp =
    f.lp.netSession == null
      ? 'not comparable (crossed a tier/division this session)'
      : `${f.lp.netSession >= 0 ? '+' : ''}${f.lp.netSession} LP net${f.lp.choppy ? ', choppy (gained then gave back)' : ''}`

  const user = `Player rank: ${rank}
Games analyzed: ${f.gameCount} (recent ranked, most recent first)
Win rate: ${pct(f.winRate)} | Overall KDA: ${f.avgKda}
Deaths per game: ${f.deathsPerGame} (in wins: ${f.deathsPerGameInWins}, in losses: ${f.deathsPerGameInLosses}) | healthy ceiling for rank: ${f.deathsBenchmark}
CS/min: ${f.avgCsPerMin} vs benchmark ${f.csBenchmark} (gap ${f.csGapVsBenchmark >= 0 ? '+' : ''}${f.csGapVsBenchmark}) | benchmark basis: ${f.benchmarkBasis}
Lead-conversion concern (healthy KDA, poor win rate): ${f.leadConversionConcern ? 'YES' : 'no'}
Session LP: ${lp}
Champion pool (${f.poolShape.championCount} champs, top champ is ${pct(f.poolShape.topChampShare)} of games, win-rate spread ${pct(f.poolShape.winRateSpread)}):
${f.pool.map(poolLine).join('\n')}
Recent games (most recent first):
${f.games.map(gameLine).join('\n')}${intentBlock(playerContext)}

Now call submit_analysis with the 2-3 highest-impact coaching insights for this player.`

  return { system: SYSTEM, user }
}
