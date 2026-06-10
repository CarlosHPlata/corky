import React, { useEffect, useState } from 'react'
import { Card } from '../components/core/Card'
import { Toggle } from '../components/core/Toggle'
import { Icon } from '../components/Icon'
import type { SummonerProfile } from '@shared/types'
import { rankLabel } from '../utils/format'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)',
  background: 'var(--bg-input)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)', padding: '7px 11px',
}

function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s
}

function AccountRows() {
  const [profile, setProfile] = useState<SummonerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    window.api.getSummonerProfile()
      .then(p => { if (!cancelled) setProfile(p) })
      .catch(() => { /* treated as no account synced */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 0' }}>
        <Icon name="refresh-cw" size={14} className="ck-spin" style={{ color: 'var(--text-faint)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>Loading account…</span>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 0' }}>
        <Icon name="history" size={14} style={{ color: 'var(--text-faint)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
          No account synced yet — sync from Home.
        </span>
      </div>
    )
  }

  const rank = rankLabel(profile.soloRank)
  const lp = profile.soloRank?.leaguePoints

  return (
    <>
      <Row label="Riot ID"><span style={fieldStyle}>{profile.gameName}#{profile.tagLine}</span></Row>
      <Row label="Region"><span style={fieldStyle}>{profile.platform.toUpperCase()} · {titleCase(profile.region)}</span></Row>
      <Row label="Solo rank"><span style={fieldStyle}>{rank}{lp != null ? ` · ${lp} LP` : ''}</span></Row>
    </>
  )
}

export function Settings() {
  return (
    <div className="ck-fade" style={{ padding: '22px 18px', maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card title="Account" eyebrow="Riot ID" padding={18}>
        <AccountRows />
      </Card>
      <Card title="Coaching" padding={18}>
        <Row label="Analyze automatically after each game"><Toggle defaultChecked /></Row>
        <Row label="Champion-select assistant"><Toggle defaultChecked /></Row>
        <Row label="Show evidence references inline"><Toggle defaultChecked /></Row>
        <Row label="In-game companion (death-screen nudges)"><Toggle /></Row>
      </Card>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '12px 14px', background: 'var(--win-soft)', border: '1px solid rgba(33,208,163,0.22)', borderRadius: 'var(--radius-md)' }}>
        <Icon name="shield" size={16} style={{ color: 'var(--win)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Corky only reads information the game already shows you. Keys stay on this machine and never touch game files.
        </span>
      </div>
    </div>
  )
}
