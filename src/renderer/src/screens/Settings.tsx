import React from 'react'
import { Card } from '../components/core/Card'
import { Toggle } from '../components/core/Toggle'
import { Icon } from '../components/Icon'
import { SUMMONER } from '../data/mockData'

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

export function Settings() {
  return (
    <div className="ck-fade" style={{ padding: '22px 24px', maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card title="Account" eyebrow="Riot ID" padding={18}>
        <Row label="Riot ID"><span style={fieldStyle}>{SUMMONER.name}#{SUMMONER.tag}</span></Row>
        <Row label="Region"><span style={fieldStyle}>{SUMMONER.region}</span></Row>
        <Row label="Main role"><span style={fieldStyle}>{SUMMONER.role}</span></Row>
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
