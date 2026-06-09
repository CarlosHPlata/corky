import React from 'react'
import { Card } from '../components/core/Card'
import { StatBlock } from '../components/core/StatBlock'
import { ProgressBar } from '../components/core/ProgressBar'
import { Icon } from '../components/Icon'

const TREND_STATS = [
  { label: 'Lead-conversion rate', value: '48', unit: '%', delta: '-14', dir: 'down' as const, caption: 'games ahead at 20 that you won' },
  { label: 'Avg solo deaths', value: '1.8', delta: '+0.7', dir: 'down' as const, caption: 'last 8 games' },
  { label: 'CS @ 10 (Ahri)', value: '72', delta: '+3', dir: 'up' as const, caption: 'trending up' },
  { label: 'First-drake presence', value: '63', unit: '%', delta: '+9', dir: 'up' as const, caption: 'improving' },
]

export function Trends() {
  return (
    <div className="ck-fade" style={{ padding: '22px 18px', maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card accent="loss" padding={18}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Icon name="trending-down" size={22} style={{ color: 'var(--loss)', flex: 'none', marginTop: 2 }} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', marginBottom: 4 }}>
              You keep stalling leads in the 20–25 minute window.
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              In 5 of your last 8 games you were ahead in gold at 20 minutes. You won 2 of them. The pattern isn't laning — it's{' '}
              <em style={{ color: 'var(--gold-300)', fontStyle: 'normal' }}>what you do with a lead.</em> Solo river deaths are the common thread.
            </p>
          </div>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {TREND_STATS.map((s, i) => (
          <Card key={i} padding={16}>
            <StatBlock label={s.label} value={s.value} unit={s.unit} delta={s.delta} deltaDir={s.dir} caption={s.caption} />
          </Card>
        ))}
      </div>
      <Card padding={18}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Lead conversion by patch</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ProgressBar label="14.9" value={61} intent="win" valueText="61%" />
          <ProgressBar label="14.10" value={54} intent="warn" valueText="54%" />
          <ProgressBar label="14.11 (now)" value={48} intent="loss" valueText="48%" />
        </div>
      </Card>
    </div>
  )
}
