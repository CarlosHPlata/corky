import React, { useState } from 'react'
import { Avatar } from './components/core/Avatar'
import { Button } from './components/core/Button'
import { Icon } from './components/Icon'
import { MatchHistory } from './screens/MatchHistory'
import { CoachReport } from './screens/CoachReport'
import { ChampSelect } from './screens/ChampSelect'
import { Trends } from './screens/Trends'
import { Settings } from './screens/Settings'
import { SUMMONER, MATCHES, type MatchMock } from './data/mockData'

type Screen = 'history' | 'report' | 'champ' | 'trends' | 'settings'

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'history', label: 'Match history', icon: 'history' },
  { id: 'champ', label: 'Champ select', icon: 'swords' },
  { id: 'trends', label: 'Trends', icon: 'trending-up' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

const TITLES: Record<Screen, [string, string | null]> = {
  history: ['Match history', `Your last ${MATCHES.length} ranked games`],
  report:  ['Post-game report', null],
  champ:   ['Champion select', 'Live · reading your lobby'],
  trends:  ['Trends', 'Patterns across your recent games'],
  settings:['Settings', null],
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 34, height: 34, borderRadius: 9, flex: 'none',
        display: 'grid', placeItems: 'center',
        background: 'linear-gradient(150deg, var(--gold-400), var(--gold-600))',
        boxShadow: 'var(--glow-gold)', color: 'var(--text-on-gold)',
      }}>
        <Icon name="crosshair" size={18} strokeWidth={2.25} />
      </span>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontVariationSettings: "'wght' 800, 'wdth' 82",
        fontSize: 24, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-primary)',
      }}>Corky</span>
    </div>
  )
}

function Sidebar({ screen, onNav }: { screen: Screen; onNav: (s: Screen) => void }) {
  const s = SUMMONER
  return (
    <aside style={{
      width: 'var(--sidebar-w)', flex: 'none', background: 'var(--bg-panel)',
      borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column',
      padding: '20px 14px',
    }}>
      <div style={{ padding: '4px 8px 22px' }}><Logo /></div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV.map(n => {
          const active = screen === n.id || (screen === 'report' && n.id === 'history')
          return (
            <button key={n.id} onClick={() => onNav(n.id)} className="ck-nav-item" data-active={String(active)}>
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
              {n.id === 'history' && <span className="ck-nav-pill">{MATCHES.length}</span>}
            </button>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
          fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-muted)',
          background: 'var(--win-soft)', border: '1px solid rgba(33,208,163,0.2)', borderRadius: 'var(--radius-md)',
        }}>
          <Icon name="shield" size={14} style={{ color: 'var(--win)' }} />
          <span>Only reads what the game shows you.</span>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '10px',
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
        }}>
          <Avatar name={s.name} size="md" ring="accent" />
          <div style={{ minWidth: 0, lineHeight: 1.3 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              {s.name} <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>#{s.tag}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {s.rank} · {s.lp} LP
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function TopBar({ title, subtitle, onSync, syncing, left }: {
  title: string
  subtitle?: string | null
  onSync?: () => void
  syncing?: boolean
  left?: React.ReactNode
}) {
  return (
    <header style={{
      height: 'var(--topbar-h)', flex: 'none', display: 'flex', alignItems: 'center', gap: 16,
      padding: '0 24px', borderBottom: '1px solid var(--border-subtle)',
      background: 'color-mix(in srgb, var(--bg-app) 78%, transparent)',
      backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 5,
    }}>
      {left}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.1 }}>{title}</div>
        {subtitle && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {onSync && (
          <Button variant="secondary" size="sm" onClick={onSync} disabled={syncing}
            iconLeft={<Icon name="refresh-cw" size={15} className={syncing ? 'ck-spin' : ''} />}>
            {syncing ? 'Syncing…' : 'Sync games'}
          </Button>
        )}
      </div>
    </header>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('history')
  const [match, setMatch] = useState<MatchMock | null>(null)
  const [analyzed, setAnalyzed] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)

  function nav(id: Screen) { setScreen(id); if (id !== 'report') setMatch(null) }
  function openMatch(m: MatchMock) { setMatch(m); setScreen('report') }
  function sync() { setSyncing(true); setTimeout(() => setSyncing(false), 1500) }

  const [title, subtitle] = match && screen === 'report'
    ? [`${match.champ} · ${match.win ? 'Win' : 'Loss'}`, `${match.queue} · ${match.dur}`]
    : TITLES[screen]

  const showSync = screen === 'history' || screen === 'report'
  const backBtn = screen === 'report'
    ? <Button variant="ghost" size="sm" onClick={() => nav('history')} iconLeft={<Icon name="chevron-left" size={16} />}>Back</Button>
    : undefined

  const key = screen === 'report' ? `report-${match?.id ?? 'x'}` : screen

  let body: React.ReactNode
  if (screen === 'history') body = <MatchHistory onOpen={openMatch} />
  else if (screen === 'report' && match) body = <CoachReport match={match} analyzed={!!analyzed[match.id]} onAnalyzed={() => setAnalyzed(a => ({ ...a, [match.id]: true }))} />
  else if (screen === 'champ') body = <ChampSelect />
  else if (screen === 'trends') body = <Trends />
  else body = <Settings />

  return (
    <>
      <Sidebar screen={screen} onNav={nav} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar title={title} subtitle={subtitle} onSync={showSync ? sync : undefined} syncing={syncing} left={backBtn} />
        <div className="ck-scroll">
          <div key={key} className="ck-fade">{body}</div>
        </div>
      </main>
    </>
  )
}
