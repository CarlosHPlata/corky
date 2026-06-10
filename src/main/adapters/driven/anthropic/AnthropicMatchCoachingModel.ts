import Anthropic from '@anthropic-ai/sdk'
import type { FramingOutput, NarrationOutput, ReviewOutput, ChatTurn } from '@shared/types'
import type {
  MatchCoachingModel, ReviewExtras, TasksExtras, TaskProposal,
  ReflectionExtras, ReflectionProposal
} from '../../../application/ports/MatchCoachingModel'
import {
  SUBMIT_REVIEW, buildReviewPrompt, parseReview,
  SUBMIT_FRAMING, buildFramingPrompt, parseFraming,
  SUBMIT_NARRATION, buildNarrationPrompt, parseNarration,
  SUBMIT_TASKS, buildTasksPrompt, parseTasks,
  COACH_CHAT_SYSTEM, buildChatMessages,
  SUBMIT_REFLECTION, buildReflectionPrompt, parseReflection
} from './matchPrompts'

interface ContentBlock {
  type: string
  name?: string
  input?: unknown
  text?: string
}

/** Minimal slice of the Anthropic client we depend on — keeps the adapter testable. */
export type CreateMessage = (params: Record<string, unknown>) => Promise<{ content: ContentBlock[] }>

/**
 * Per-match coach over Anthropic. Uses forced tool-use so the model emits
 * schema-shaped JSON natively (mirrors AnthropicSessionCoachingModel). The light
 * tier handles framing/narration; the heavy tier handles review/tasks — but the
 * model name is passed per call, so tiering is the orchestrator's choice.
 *
 * Passes 1, 2 and 4 are implemented in their own stories (US3/US2/US4); until
 * then they throw, and the orchestrator records that section as an error.
 */
export class AnthropicMatchCoachingModel implements MatchCoachingModel {
  constructor(private readonly createMessage: CreateMessage) {}

  /** Production constructor — wraps the real SDK behind the minimal CreateMessage. */
  static fromApiKey(apiKey: string): AnthropicMatchCoachingModel {
    const client = new Anthropic({ apiKey })
    const create: CreateMessage = (params) =>
      client.messages.create(
        params as unknown as Parameters<typeof client.messages.create>[0]
      ) as unknown as Promise<{ content: ContentBlock[] }>
    return new AnthropicMatchCoachingModel(create)
  }

  private async callTool(
    system: string,
    user: string,
    tool: { name: string },
    model: string,
    maxTokens: number
  ): Promise<unknown> {
    const message = await this.createMessage({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name }
    })
    const block = message.content.find((c) => c.type === 'tool_use' && c.name === tool.name)
    if (!block || block.input == null) {
      throw new Error(`Match coach did not return a ${tool.name} payload`)
    }
    return block.input
  }

  async analyzeFraming(ctx: string, model: string): Promise<FramingOutput> {
    const { system, user } = buildFramingPrompt(ctx)
    return parseFraming(await this.callTool(system, user, SUBMIT_FRAMING, model, 700))
  }

  async analyzeNarration(ctx: string, model: string): Promise<NarrationOutput> {
    const { system, user } = buildNarrationPrompt(ctx)
    return parseNarration(await this.callTool(system, user, SUBMIT_NARRATION, model, 1200))
  }

  async analyzeReview(ctx: string, extras: ReviewExtras, model: string): Promise<ReviewOutput> {
    const { system, user } = buildReviewPrompt(ctx, extras)
    return parseReview(await this.callTool(system, user, SUBMIT_REVIEW, model, 1500))
  }

  async analyzeTasks(ctx: string, extras: TasksExtras, model: string): Promise<TaskProposal> {
    const { system, user } = buildTasksPrompt(ctx, extras)
    return parseTasks(await this.callTool(system, user, SUBMIT_TASKS, model, 1200))
  }

  async chat(briefing: string, history: ChatTurn[], model: string): Promise<string> {
    const message = await this.createMessage({
      model,
      max_tokens: 400,
      system: COACH_CHAT_SYSTEM,
      messages: buildChatMessages(briefing, history)
    })
    const text = message.content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('')
      .trim()
    if (!text) throw new Error('Match coach returned an empty reply')
    return text
  }

  async summarizeReflection(
    briefing: string,
    history: ChatTurn[],
    extras: ReflectionExtras,
    model: string
  ): Promise<ReflectionProposal> {
    const { system, messages } = buildReflectionPrompt(briefing, history, extras)
    const message = await this.createMessage({
      model,
      max_tokens: 900,
      system,
      messages,
      tools: [SUBMIT_REFLECTION],
      tool_choice: { type: 'tool', name: SUBMIT_REFLECTION.name }
    })
    const block = message.content.find((c) => c.type === 'tool_use' && c.name === SUBMIT_REFLECTION.name)
    if (!block || block.input == null) {
      throw new Error('Match coach did not return a submit_reflection payload')
    }
    return parseReflection(block.input)
  }
}
