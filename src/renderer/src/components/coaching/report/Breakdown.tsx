import { Card } from '../../core/Card'
import { StatBlock } from '../../core/StatBlock'
import { Askable, type AddRef } from '../AskRef'
import { goldDiffK, nr, statRef } from './format'
import type { Breakdown as BreakdownData, EvidenceRef } from '@shared/types'

// ── FACTUAL: the decided-by-numbers breakdown (US2) ──────────────────────────
export function Breakdown({ b, onAsk }: { b: BreakdownData; onAsk?: AddRef }) {
  const stats: { label: string; value: string; caption: string; unit?: string; ref: EvidenceRef }[] = [
    { label: 'CS @ 10', value: nr(b.csAt10, String), caption: 'minions at 10:00', ref: statRef('cs_at_10', 'CS at 10:00') },
    { label: 'CS / min', value: b.csPerMin.toFixed(1), caption: 'full game', ref: statRef('cs_per_min', 'CS per minute') },
    { label: 'Gold @ 14', value: nr(b.goldAt14, goldDiffK), caption: 'vs lane opponent', ref: statRef('gold_at_14', 'Gold diff at 14:00') },
    { label: 'Gold @ 24', value: nr(b.goldAt24, goldDiffK), caption: 'vs lane opponent', ref: statRef('gold_at_24', 'Gold diff at 24:00') },
    { label: 'Vision', value: String(b.visionScore), caption: 'vision score', ref: statRef('vision_score', 'Vision score') },
    { label: 'Solo deaths', value: String(b.soloDeaths), caption: 'died alone', ref: statRef('solo_deaths', 'Solo deaths') },
    { label: 'Kill part.', value: Math.round(b.killParticipation * 100) + '%', caption: 'of team kills', ref: statRef('kill_participation', 'Kill participation') },
  ]
  return (
    <Card padding={16}>
      <div className="eyebrow" style={{ fontSize: 11, marginBottom: 14 }}>Breakdown</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '18px 14px' }}>
        {stats.map(({ ref, ...s }, i) => (
          <Askable key={i} evidence={ref} onAsk={onAsk}>
            <StatBlock size="sm" {...s} />
          </Askable>
        ))}
      </div>
    </Card>
  )
}
