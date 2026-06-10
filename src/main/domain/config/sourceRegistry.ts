import type { DataSourceInfo } from '@shared/config'

// Pure. The hardcoded registry of every data source the coach may consult —
// the source of truth for ids, labels and defaults. Stored config holds only
// overrides keyed by these ids; the app is fully functional with zero config.

/** Registry entry — DataSourceInfo without resolved state, plus its default. */
export type DataSourceMeta = Omit<DataSourceInfo, 'enabled'> & { defaultEnabled: boolean }

/** Ordered registry — resolveConfig preserves this order for the UI. */
export const DATA_SOURCES: DataSourceMeta[] = [
  {
    id: 'opgg-mcp',
    kind: 'mcp',
    label: 'OP.GG meta benchmarks',
    description: 'Champion/lane reference stats behind the review pass.',
    usedBy: ['analysis'],
    defaultEnabled: true
  },
  {
    id: 'riot-match-v5',
    kind: 'riot-api',
    label: 'Match & timeline',
    description: 'Your games fetched once and stored locally.',
    usedBy: ['sync'],
    lockedReason: 'Required for match sync',
    defaultEnabled: true
  },
  {
    id: 'riot-league-v4',
    kind: 'riot-api',
    label: 'Rank & profile',
    description: 'Tier/LP/profile on Home.',
    usedBy: ['sync'],
    lockedReason: 'Required for profile sync',
    defaultEnabled: true
  },
  {
    id: 'riot-agent-lookups',
    kind: 'riot-api',
    label: 'Agent-initiated lookups',
    description: 'Let the coach fetch beyond stored games when a question needs it.',
    usedBy: ['chat'],
    defaultEnabled: false
  },
  {
    id: 'local-som',
    kind: 'local',
    label: 'Semantic memory',
    description: 'Patterns and reflections distilled from past sessions.',
    usedBy: ['analysis', 'chat'],
    defaultEnabled: true
  },
  {
    id: 'local-history',
    kind: 'local',
    label: 'Match history aggregates',
    description: 'Your own past games as comparison cohorts.',
    usedBy: ['analysis', 'chat'],
    defaultEnabled: true
  }
]
