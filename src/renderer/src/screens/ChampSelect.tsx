import React from 'react'
import { Card } from '../components/core/Card'
import { Badge } from '../components/core/Badge'
import { ChampAvatar } from '../components/ChampAvatar'
import { Icon } from '../components/Icon'
import { CHAMP_SELECT } from '../data/mockData'

type Side = 'ally' | 'enemy'

function TeamColumn({ players, side }: { players: typeof CHAMP_SELECT.ally; side: Side }) {
  const ally = side === 'ally'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: ally ? 'var(--data-ally)' : 'var(--data-enemy)' }} />
        <span className="eyebrow" style={{ color: ally ? 'var(--blue-400)' : 'var(--red-400)' }}>{ally ? 'Your team' : 'Enemy team'}</span>
      </div>
      {players.map((p, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-md)',
          background: p.you ? 'var(--accent-soft)' : 'var(--bg-card)',
          border: `1px solid ${p.you ? 'rgba(242,179,61,0.35)' : 'var(--border-subtle)'}`,
          flexDirection: ally ? 'row' : 'row-reverse', textAlign: ally ? 'left' : 'right',
        }}>
          <ChampAvatar name={p.champ} size="sm" shape="rounded" ring={p.you ? 'accent' : (ally ? 'info' : 'loss')} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>
              {p.champ}{p.you && <span style={{ color: 'var(--gold-400)', fontSize: 11, marginLeft: 6 }}>You</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{p.role}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function InfoCard({ icon, title, children, accent }: { icon: string; title: string; children: React.ReactNode; accent?: 'accent' | 'win' | 'loss' | 'objective' }) {
  return (
    <Card accent={accent} padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <Icon name={icon} size={16} style={{ color: 'var(--gold-400)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      {children}
    </Card>
  )
}

export function ChampSelect() {
  const c = CHAMP_SELECT
  return (
    <div style={{ padding: '22px 24px 50px', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 20, alignItems: 'start', marginBottom: 24 }}>
        <TeamColumn players={c.ally} side="ally" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 26 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wght' 800, 'wdth' 78", fontSize: 30, color: 'var(--text-faint)' }}>VS</span>
          <Icon name="swords" size={20} style={{ color: 'var(--text-faint)' }} />
        </div>
        <TeamColumn players={c.enemy} side="enemy" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <Icon name="sparkles" size={16} style={{ color: 'var(--gold-400)' }} />
        <span className="eyebrow" style={{ fontSize: 12 }}>Corky's read on this game</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <InfoCard icon="swords" title={`Lane matchup · vs ${c.matchup.vs}`} accent="accent">
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{c.matchup.summary}</p>
          <Badge intent="warn" style={{ marginTop: 10 }}>Even — respect level 6</Badge>
        </InfoCard>

        <InfoCard icon="shield" title="Main threats">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {c.threats.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <ChampAvatar name={t.champ} size="sm" shape="rounded" ring="loss" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{t.champ}</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>{t.text}</div>
                </div>
              </div>
            ))}
          </div>
        </InfoCard>

        <InfoCard icon="target" title="Win condition">
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{c.winCondition}</p>
        </InfoCard>

        <InfoCard icon="crosshair" title="Build & rune direction">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {([['Runes', c.build.runes], ['Summoners', c.build.summoners], ['First item', c.build.firstItem], ['Boots', c.build.boots]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', width: 80, flex: 'none' }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{v}</span>
              </div>
            ))}
          </div>
        </InfoCard>
      </div>
    </div>
  )
}
