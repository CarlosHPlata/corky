import Anthropic from '@anthropic-ai/sdk'
import type { FramingOutput, NarrationOutput, ReviewOutput, ChatTurn } from '@shared/types'
import type {
  MatchCoachingModel, ReviewExtras, TasksExtras, TaskProposal,
  DiscoveryPlan, AgenticChatExtras, AgenticChatResult, ExistingMemoryEntry
} from '../../../application/ports/MatchCoachingModel'
import type { RawProposal } from '../../../domain/chat/proposal'
import type { ProposedSemanticObject } from '../../../domain/memory/semanticObject'
import {
  SUBMIT_REVIEW, buildReviewPrompt, parseReview,
  SUBMIT_FRAMING, buildFramingPrompt, parseFraming,
  SUBMIT_NARRATION, buildNarrationPrompt, parseNarration,
  SUBMIT_TASKS, buildTasksPrompt, parseTasks,
  buildSystemPrompt, buildChatMessages,
  SUBMIT_PLAN, buildDiscoveryPrompt, parseDiscoveryPlan,
  SUBMIT_REFLECTION_TEXT, buildSummarizePrompt, parseReflectionText,
  SUBMIT_MEMORY, buildDistillPrompt, parseDistilledMemory,
  PROPOSE_TOOLS, buildAgenticPrompt, parseProposalPayload
} from './matchPrompts'
import type { PromptId } from '../../../domain/config/promptRegistry'

interface ContentBlock {
  type: string
  id?: string
  name?: string
  input?: unknown
  text?: string
}

/** Minimal slice of the Anthropic client we depend on — keeps the adapter testable. */
export type CreateMessage = (params: Record<string, unknown>) => Promise<{ content: ContentBlock[] }>

/**
 * Provider of the effective coaching-instructions text per pass id (the
 * user-editable layer of each system prompt). Called per model invocation so
 * Settings edits apply without a restart; absent provider/entry ⇒ the
 * hardcoded registry defaults.
 */
export type InstructionsProvider = () => Record<string, string>

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
  constructor(
    private readonly createMessage: CreateMessage,
    private readonly instructions?: InstructionsProvider
  ) {}

  /** Production constructor — wraps the real SDK behind the minimal CreateMessage. */
  static fromApiKey(apiKey: string, instructions?: InstructionsProvider): AnthropicMatchCoachingModel {
    const client = new Anthropic({ apiKey })
    const create: CreateMessage = (params) =>
      client.messages.create(
        params as unknown as Parameters<typeof client.messages.create>[0]
      ) as unknown as Promise<{ content: ContentBlock[] }>
    return new AnthropicMatchCoachingModel(create, instructions)
  }

  /** Effective instruction text for one pass, re-read on every invocation. */
  private instructionsFor(id: PromptId): string | undefined {
    return this.instructions?.()[id]
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
    const { system, user } = buildFramingPrompt(ctx, this.instructionsFor('framing'))
    return parseFraming(await this.callTool(system, user, SUBMIT_FRAMING, model, 700))
  }

  async analyzeNarration(ctx: string, model: string): Promise<NarrationOutput> {
    const { system, user } = buildNarrationPrompt(ctx, this.instructionsFor('narration'))
    return parseNarration(await this.callTool(system, user, SUBMIT_NARRATION, model, 1200))
  }

  async analyzeReview(ctx: string, extras: ReviewExtras, model: string): Promise<ReviewOutput> {
    const { system, user } = buildReviewPrompt(ctx, extras, this.instructionsFor('review'))
    return parseReview(await this.callTool(system, user, SUBMIT_REVIEW, model, 1500))
  }

  async analyzeTasks(ctx: string, extras: TasksExtras, model: string): Promise<TaskProposal> {
    const { system, user } = buildTasksPrompt(ctx, extras, this.instructionsFor('tasks'))
    return parseTasks(await this.callTool(system, user, SUBMIT_TASKS, model, 1200))
  }

  async chat(briefing: string, history: ChatTurn[], model: string): Promise<string> {
    const message = await this.createMessage({
      model,
      max_tokens: 400,
      system: buildSystemPrompt('chat', this.instructionsFor('chat')),
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

  /**
   * Agentic chat (spec 005): a BOUNDED propose-only tool loop. At most
   * MAX_TOOL_ROUNDS assistant rounds may carry tool calls; the loop then forces
   * a plain-text completion. A tool call never executes anything — it is
   * captured as a raw proposal (last valid one wins) and answered with a
   * synthetic result. Mid-loop failures degrade to whatever text exists.
   */
  async chatAgentic(
    briefing: string,
    history: ChatTurn[],
    extras: AgenticChatExtras,
    model: string
  ): Promise<AgenticChatResult> {
    const MAX_TOOL_ROUNDS = 3
    const { system, messages } = buildAgenticPrompt(
      briefing, history, extras, this.instructionsFor('chat.agentic')
    )
    const convo: Record<string, unknown>[] = [...messages]
    const textParts: string[] = []
    let rawProposal: RawProposal | undefined

    try {
      // Rounds 0..MAX-1 offer the tools; round MAX is the forced-text closer
      // that only happens when the model was still calling tools at the cap.
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const offerTools = round < MAX_TOOL_ROUNDS
        const message = await this.createMessage({
          model,
          max_tokens: 700,
          system,
          messages: convo,
          ...(offerTools ? { tools: PROPOSE_TOOLS, tool_choice: { type: 'auto' } } : {})
        })

        for (const block of message.content) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            textParts.push(block.text.trim())
          }
        }

        const toolUses = message.content.filter((c) => c.type === 'tool_use')
        if (toolUses.length === 0) break

        convo.push({ role: 'assistant', content: message.content })
        const results = toolUses.map((tu) => {
          // One pending card at a time: with one already on the table (from a
          // previous turn or earlier in this loop), refuse rather than stack.
          if (extras.hasPendingProposal) {
            return {
              type: 'tool_result',
              tool_use_id: tu.id ?? '',
              content: "A proposal is already awaiting the player's decision — continue in plain text.",
              is_error: true
            }
          }
          try {
            rawProposal = parseProposalPayload(tu.name ?? '', tu.input) // last valid wins
            return {
              type: 'tool_result',
              tool_use_id: tu.id ?? '',
              content: 'Proposal recorded — it will be shown to the player for confirmation. Continue your reply in plain text.'
            }
          } catch (err) {
            return {
              type: 'tool_result',
              tool_use_id: tu.id ?? '',
              content: `${err instanceof Error ? err.message : 'Malformed payload'} — fix the payload or continue without proposing.`,
              is_error: true
            }
          }
        })
        convo.push({ role: 'user', content: results })
      }
    } catch (err) {
      // Mid-loop failure: whatever text already exists is still a coaching
      // reply (FR-028). With nothing at all, the caller shows its retry bubble.
      if (textParts.length === 0 && !rawProposal) throw err
    }

    const reply = textParts.join('\n').trim()
    if (!reply && !rawProposal) throw new Error('Match coach returned an empty reply')
    return { reply, ...(rawProposal ? { rawProposal } : {}) }
  }

  async planDiscovery(question: string, inventory: string, model: string): Promise<DiscoveryPlan> {
    const { system, user } = buildDiscoveryPrompt(question, inventory, this.instructionsFor('discovery'))
    // A tiny planning call — the payload is at most 5 short request objects.
    return parseDiscoveryPlan(await this.callTool(system, user, SUBMIT_PLAN, model, 300))
  }

  async summarizeReflectionText(
    briefing: string,
    history: ChatTurn[],
    model: string
  ): Promise<{ text: string; refIds: string[] }> {
    const { system, messages } = buildSummarizePrompt(briefing, history, this.instructionsFor('reflection'))
    const message = await this.createMessage({
      model,
      max_tokens: 600,
      system,
      messages,
      tools: [SUBMIT_REFLECTION_TEXT],
      tool_choice: { type: 'tool', name: SUBMIT_REFLECTION_TEXT.name }
    })
    const block = message.content.find((c) => c.type === 'tool_use' && c.name === SUBMIT_REFLECTION_TEXT.name)
    if (!block || block.input == null) {
      throw new Error('Match coach did not return a submit_reflection_text payload')
    }
    return parseReflectionText(block.input)
  }

  async distillMemory(
    briefing: string,
    history: ChatTurn[],
    existingMemory: ExistingMemoryEntry[],
    model: string
  ): Promise<ProposedSemanticObject[]> {
    const { system, messages } = buildDistillPrompt(
      briefing, history, existingMemory, this.instructionsFor('distill')
    )
    const message = await this.createMessage({
      model,
      max_tokens: 700,
      system,
      messages,
      tools: [SUBMIT_MEMORY],
      tool_choice: { type: 'tool', name: SUBMIT_MEMORY.name }
    })
    const block = message.content.find((c) => c.type === 'tool_use' && c.name === SUBMIT_MEMORY.name)
    if (!block || block.input == null) {
      throw new Error('Match coach did not return a submit_memory payload')
    }
    return parseDistilledMemory(block.input)
  }
}
