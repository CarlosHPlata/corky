/** Token budget tier for coaching calls — scales how much context the coach spends. */
export type BudgetTier = 'eco' | 'standard' | 'deep'

/** A data source the coach may consult, with its resolved on/off state. */
export interface DataSourceInfo {
  id: string
  /** Transport family: an MCP server, the Riot API, or purely local data. */
  kind: 'mcp' | 'riot-api' | 'local'
  /** Human label for UI listing. */
  label: string
  description: string
  /** Which features consume it (e.g. 'sync', 'analysis', 'chat'). */
  usedBy: string[]
  /** Present when the source cannot be disabled; explains why. */
  lockedReason?: string
  /** Effective state after applying overrides (locked sources are always true). */
  enabled: boolean
}

/** A context block that feeds the model, with its resolved on/off state. */
export interface ContextBlockInfo {
  id: string
  /** Where the lines come from: match facts, the player's stated intent, or carried pass outputs. */
  group: string
  /** Human label for UI listing. */
  label: string
  description: string
  /** Renders regardless of the enabled set — the model cannot work without it. */
  alwaysOn?: boolean
  /** Static rough token estimate for UI budgeting. */
  typicalTokens: number
  /** External source the block depends on, when it has one. */
  requiresSource?: string
  /** Effective state after applying overrides (alwaysOn blocks are always true). */
  enabled: boolean
}

/** A coaching pass's editable prompt-instructions layer, with its resolved text. */
export interface PromptInfo {
  id: string
  /** Human label for UI listing. */
  label: string
  description: string
  /** Effective coaching-instructions text after applying overrides. */
  instructions: string
  /** True when the effective text differs from the hardcoded default. */
  modified: boolean
  /** True when an override exists but the hardcoded default has since changed
   * (its stored baseHash no longer matches the current default's hash). */
  staleDefault: boolean
}

/** The full coaching configuration after merging defaults with stored overrides. */
export interface ResolvedCoachingConfig {
  sources: DataSourceInfo[]
  blocks: ContextBlockInfo[]
  budgetTier: BudgetTier
  prompts: PromptInfo[]
  /** True when any effective value differs from its hardcoded default. */
  modified: boolean
}

/** The full desired state from the settings UI (every toggle, not a delta). */
export interface SaveCoachingConfigInput {
  sources: Record<string, boolean>
  blocks: Record<string, boolean>
  budgetTier: BudgetTier
  /** Effective instruction text per prompt id; entries matching the default
   * (or blank) store no override. */
  prompts: Record<string, string>
}

/**
 * What actually gets persisted: ONLY the deviations from the defaults, keyed by
 * id. Absence (null record) means pure defaults; restoring defaults deletes the
 * record. Unknown ids are silently dropped on resolve, so stale overrides from
 * removed registry entries never break anything.
 */
export interface CoachingConfigOverrides {
  version: 1
  sources?: Record<string, boolean>
  blocks?: Record<string, boolean>
  budgetTier?: BudgetTier
  /** Edited coaching-instructions per prompt id, each carrying the hash of the
   * default it was written against (stale-default detection after app updates). */
  prompts?: Record<string, { text: string; baseHash: string }>
}
