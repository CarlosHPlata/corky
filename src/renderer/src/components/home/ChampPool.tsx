import { Card } from '../core/Card'
import { ProgressBar } from '../core/ProgressBar'
import { ChampAvatar } from '../ChampAvatar'
import { wrColor, wrIntent, type ChampStat } from './format'

// Champion pool: most-played + win rates.
export function ChampPool({ pool }: { pool: ChampStat[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(232px, 1fr))', gap: 14 }}>
      {pool.map((c, i) => (
        <Card key={i} padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
            <ChampAvatar name={c.champ} size="md" shape="rounded" ring={wrColor(c.wr)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.1 }}>{c.champ}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                {c.role} · {c.g} {c.g === 1 ? 'game' : 'games'}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: wrColor(c.wr), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{c.wr}%</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                <span style={{ color: 'var(--win)' }}>{c.w}W</span>{' '}
                <span style={{ color: 'var(--loss)' }}>{c.g - c.w}L</span>
              </div>
            </span>
          </div>
          <ProgressBar value={c.wr} intent={wrIntent(c.wr)} height={6} showValue={false} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 11, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)' }}>
            <span>{c.kda} KDA</span>
            <span>{c.csmin} CS/min</span>
          </div>
        </Card>
      ))}
    </div>
  )
}
