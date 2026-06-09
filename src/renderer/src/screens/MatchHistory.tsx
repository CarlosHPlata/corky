import React, { useEffect, useRef } from 'react'
import { ChampAvatar } from '../components/ChampAvatar'
import { Badge } from '../components/core/Badge'
import { Button } from '../components/core/Button'
import { Icon } from '../components/Icon'
import { useMatchHistory } from '../data/useMatchHistory'
import { formatDuration, queueLabel, relativeTime } from '../utils/format'
import type { MatchSummary } from '@shared/types'

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

function goldK(gold: number): string {
  return (gold / 1000).toFixed(1) + 'k'
}

function MatchRow({ m, onOpen }: { m: MatchSummary; onOpen: (matchId: string) => void }) {
  return (
    <button className="ck-match" data-win={String(m.win)} onClick={() => onOpen(m.matchId)}>
      <span className="ck-match__bar" />
      <ChampAvatar name={m.champion} size="md" shape="rounded" ring={m.win ? 'win' : 'loss'} />
      <div style={{ minWidth: 170, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{m.champion}</span>
          <Badge intent={m.win ? 'win' : 'loss'} solid>{m.win ? 'Win' : 'Loss'}</Badge>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {m.role} · {queueLabel(m.queue)} · {relativeTime(m.gameCreation)}
        </div>
      </div>
      <KDA k={m.kills} d={m.deaths} a={m.assists} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 64 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{m.cs}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{m.csPerMin}/min</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{goldK(m.gold)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{m.goldPerMin}/min gold</span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)', minWidth: 44, textAlign: 'right' }}>{formatDuration(m.gameDuration)}</span>
      <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flex: 'none' }} />
    </button>
  )
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}

export function MatchHistory({ onOpen }: { onOpen: (matchId: string) => void }) {
  const { matches, loading, loadingMore, done, error, loadMore, retry } = useMatchHistory()
  const sentinel = useRef<HTMLDivElement>(null)

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '400px' } // prefetch before the user hits the very end (SC-002)
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  if (loading) {
    return <CenteredNote><Icon name="refresh-cw" size={18} className="ck-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />Loading your games…</CenteredNote>
  }

  if (matches.length === 0) {
    return (
      <CenteredNote>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Icon name="history" size={22} style={{ color: 'var(--text-faint)' }} />
          <span>No games synced yet. Sync from the top bar to pull in your recent matches.</span>
        </div>
      </CenteredNote>
    )
  }

  const wins = matches.filter(m => m.win).length

  return (
    <div style={{ padding: '22px 18px', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span className="eyebrow">Last {matches.length} games</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--win)' }}>{wins}W</span>{' '}
          <span style={{ color: 'var(--loss)' }}>{matches.length - wins}L</span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)' }}>
          <Icon name="bar-chart-3" size={14} style={{ color: 'var(--gold-400)' }} />
          Click a game for its full stats
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {matches.map(m => <MatchRow key={m.matchId} m={m} onOpen={onOpen} />)}
      </div>

      {/* infinite-scroll sentinel + footer states */}
      <div ref={sentinel} style={{ height: 1 }} />
      <div style={{ padding: '18px 0 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)' }}>
        {error ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: 'var(--loss)' }}>
            <Icon name="shield" size={14} /> Couldn’t load more games.
            <Button variant="ghost" size="sm" onClick={retry}>Retry</Button>
          </span>
        ) : loadingMore ? (
          <span><Icon name="refresh-cw" size={14} className="ck-spin" style={{ verticalAlign: 'middle', marginRight: 7 }} />Loading more…</span>
        ) : done ? (
          <span>That’s every game Corky has — sync after your next match for more.</span>
        ) : null}
      </div>
    </div>
  )
}
