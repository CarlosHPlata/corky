import { Card } from '../components/core/Card'
import { Button } from '../components/core/Button'
import { GoalNotes } from '../components/GoalNotes'
import { Icon } from '../components/Icon'
import {
  SectionLabel, CenteredNote, Hero, ChampPool, LpRankChart, FocusCard, QuickAnalysis,
  champPool, type Screen,
} from '../components/home'
import type { AppData } from '../data/useAppData'
import { absoluteLp } from '../utils/format'

// Corky desktop — Home / overview.
//
// This screen is the orchestrator: it owns the app data, derives the session LP
// delta + champion pool, and lays out the page. Every section's rendering lives
// in `../components/home`.

export function Home({ data, onOpen, onNav }: {
  data: AppData; onOpen: (matchId: string) => void; onNav: (s: Screen) => void
}) {
  const { profile, matches, lpHistory, loading, syncing, error, sync } = data
  const pool = champPool(matches)

  // Session LP delta on the absolute ladder scale, so it survives promotions.
  let net: number | null = null
  if (lpHistory.length >= 2) {
    net = absoluteLp(lpHistory[lpHistory.length - 1]) - absoluteLp(lpHistory[0])
  }

  if (loading) {
    return <CenteredNote><Icon name="refresh-cw" size={18} className="ck-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />Loading your games…</CenteredNote>
  }

  if (!profile && matches.length === 0) {
    return (
      <div style={{ padding: '22px 18px 60px', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
        <Card padding={28}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
              <Icon name="crosshair" size={24} style={{ color: 'var(--gold-400)' }} />
            </span>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>Let’s pull in your games</div>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.55, margin: 0 }}>
              Corky reads your recent ranked games and current rank straight from the Riot API. Sync to get started.
            </p>
            {error && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--loss)' }}>{error}</div>}
            <Button variant="primary" size="md" onClick={sync} disabled={syncing}
              iconLeft={<Icon name="refresh-cw" size={16} className={syncing ? 'ck-spin' : ''} />}>
              {syncing ? 'Syncing…' : 'Sync my games'}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: '22px 18px 60px', maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {error && (
        <Card accent="loss" padding={14}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--loss)' }}>
            <Icon name="shield" size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />
            Sync failed: {error}
          </span>
        </Card>
      )}

      {/* 1 — Overview */}
      {profile && (
        <section>
          <Hero profile={profile} matches={matches} net={net} onNav={onNav} />
        </section>
      )}

      {/* 2 — Champion pool, right below the overview */}
      {pool.length > 0 && (
        <section>
          <SectionLabel
            icon="swords"
            right={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)' }}>last {matches.length} games</span>}>
            Champion pool
          </SectionLabel>
          <ChampPool pool={pool} />
        </section>
      )}

      {/* 3 — LP & rank trajectory */}
      <section>
        <SectionLabel icon="trending-up" tone="var(--blue-400)">LP &amp; rank · this session</SectionLabel>
        <LpRankChart history={lpHistory} rank={profile?.soloRank ?? null} />
      </section>

      {/* 4 — Corky power tools: session goal, then focus + analysis side by side */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionLabel icon="sparkles" tone="var(--violet-400)">Corky · power tools</SectionLabel>

        <GoalNotes />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
          <FocusCard onOpen={onOpen} latestMatchId={matches[0]?.matchId} />
          <QuickAnalysis />
        </div>
      </section>
    </div>
  )
}
