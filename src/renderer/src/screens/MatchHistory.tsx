import React from 'react'
import { Avatar } from '../components/core/Avatar'
import { Badge } from '../components/core/Badge'
import { Icon } from '../components/Icon'
import { MATCHES, type MatchMock } from '../data/mockData'

function KDA({ k, d, a }: { k: number; d: number; a: number }) {
  const ratio = ((k + a) / Math.max(1, d)).toFixed(1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 78 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {k} / <span style={{ color: 'var(--loss)' }}>{d}</span> / {a}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{ratio} KDA</span>
    </div>
  )
}

function MatchRow({ m, onOpen }: { m: MatchMock; onOpen: (m: MatchMock) => void }) {
  return (
    <button className="ck-match" data-win={String(m.win)} onClick={() => onOpen(m)}>
      <span className="ck-match__bar" />
      <Avatar name={m.champ} size="md" shape="rounded" ring={m.win ? 'win' : 'loss'} />
      <div style={{ minWidth: 170, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{m.champ}</span>
          <Badge intent={m.win ? 'win' : 'loss'} solid>{m.win ? 'Win' : 'Loss'}</Badge>
          {m.isNew && <Badge intent="accent" dot>New</Badge>}
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {m.role} · {m.queue} · {m.when}
        </div>
      </div>
      <KDA k={m.k} d={m.d} a={m.a} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 64 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{m.cs}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{m.csmin}/min</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{m.reason}</span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)', minWidth: 44, textAlign: 'right' }}>{m.dur}</span>
      <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flex: 'none' }} />
    </button>
  )
}

export function MatchHistory({ onOpen }: { onOpen: (m: MatchMock) => void }) {
  const wins = MATCHES.filter(m => m.win).length
  return (
    <div style={{ padding: '22px 24px', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span className="eyebrow">Last {MATCHES.length} games</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--win)' }}>{wins}W</span>{' '}
          <span style={{ color: 'var(--loss)' }}>{MATCHES.length - wins}L</span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)' }}>
          <Icon name="sparkles" size={14} style={{ color: 'var(--gold-400)' }} />
          Click a game for the coaching report
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MATCHES.map(m => <MatchRow key={m.id} m={m} onOpen={onOpen} />)}
      </div>
    </div>
  )
}
