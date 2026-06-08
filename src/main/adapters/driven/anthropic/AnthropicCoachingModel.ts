import Anthropic from '@anthropic-ai/sdk'
import type { CoachingModel, CoachingOutput } from '../../../application/ports/CoachingModel'
import type { MatchFeatures } from '../../../domain/MatchFeatures'

export class AnthropicCoachingModel implements CoachingModel {
  private readonly client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async analyze(features: MatchFeatures, model: string): Promise<CoachingOutput> {
    const prompt = buildPrompt(features)

    const message = await this.client.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })

    const rawContent =
      message.content[0].type === 'text' ? message.content[0].text : ''

    return parseCoachingOutput(rawContent)
  }
}

function buildPrompt(features: MatchFeatures): string {
  return `You are Corky, a League of Legends coach. Analyze this game played as ${features.champion} and provide structured coaching.

Match result: ${features.win ? 'WIN' : 'LOSS'}
Lead conversion failed: ${features.leadConversionFailed}
CS at 10/15/20 min: ${features.csAt10} / ${features.csAt15} / ${features.csAt20} (benchmark: ${features.csRoleBenchmark})
Total deaths: ${features.deaths.length}
Death labels: ${features.deaths.map((d) => d.label).join(', ')}
Objective participation: ${features.objectiveEvents.filter((e) => e.playerPresent).length}/${features.objectiveEvents.length}
Wards placed/killed: ${features.vision.wardsPlaced}/${features.vision.wardsKilled}
Team gold diff at 20min: ${features.teamGoldDiffAt20}

Respond in this exact JSON format:
{
  "verdict": "One or two sentences on why this game was won or lost.",
  "focusTasks": [
    { "description": "...", "metric": "cs_at_10", "comparator": ">=", "target": 70, "scope": "role" }
  ],
  "turningPoints": [
    { "timestamp": 900000, "description": "...", "betterPlay": "...", "evidenceRef": "goldDiff@15:00" }
  ]
}`
}

function parseCoachingOutput(raw: string): CoachingOutput {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    return {
      verdict: parsed.verdict ?? '',
      focusTasks: parsed.focusTasks ?? [],
      turningPoints: parsed.turningPoints ?? [],
      rawContent: raw
    }
  } catch {
    return { verdict: raw, focusTasks: [], turningPoints: [], rawContent: raw }
  }
}
