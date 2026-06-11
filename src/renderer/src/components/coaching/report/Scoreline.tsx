import { Card } from '../../core/Card'
import { StatBlock } from '../../core/StatBlock'
import { ChampAvatar } from '../../ChampAvatar'
import { Askable, type AddRef } from '../AskRef'
import { formatDuration, queueLabel } from '../../../utils/format'
import { goldK, statRef } from './format'
import type { MatchCore } from '@shared/types'

// ── FACTUAL: scoreline economy (US2) ─────────────────────────────────────────
export function Scoreline({ core, onAsk }: { core: MatchCore; onAsk?: AddRef }) {
  const stats = [
    { label: 'KDA', value: core.kdaRatio.toFixed(2), caption: `${core.kills} / ${core.deaths} / ${core.assists}`, ref: statRef('kda', 'KDA ratio') },
    { label: 'CS', value: String(core.cs), caption: `${core.role.toLowerCase()} farm`, ref: statRef('cs', 'CS') },
    { label: 'CS / min', value: core.csPerMin.toFixed(1), caption: 'minions + jungle', ref: statRef('cs_per_min', 'CS per minute') },
    { label: 'Gold', value: goldK(core.gold), caption: 'earned total', ref: statRef('gold', 'Total gold') },
    { label: 'Gold / min', value: String(core.goldPerMin), caption: 'economy rate', ref: statRef('gold_per_min', 'Gold per minute') },
  ]
  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '16px 20px', minWidth: 196 }}>
          <ChampAvatar name={core.champion} size="lg" shape="rounded" ring={core.win ? 'win' : 'loss'} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: 11, color: core.win ? 'var(--win)' : 'var(--loss)', marginBottom: 3 }}>
              {core.role} · {core.win ? 'Victory' : 'Defeat'}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 21, color: 'var(--text-primary)', lineHeight: 1.05 }}>
              {core.champion}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {formatDuration(core.durationSec)} · {queueLabel(core.queue)}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 22, padding: '16px 22px', borderLeft: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          {stats.map(({ ref, ...s }, i) => (
            <Askable key={i} evidence={ref} onAsk={onAsk}>
              <StatBlock size="sm" {...s} />
            </Askable>
          ))}
        </div>
      </div>
    </Card>
  )
}
