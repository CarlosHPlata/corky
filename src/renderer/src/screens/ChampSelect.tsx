import { Badge } from '../components/core/Badge'
import { Icon } from '../components/Icon'
import type { ChampSelectData } from '../data/useChampSelect'
import { TeamColumn, BansRow, ReadCard, Hint, EmptyState } from '../components/champSelect'

export function ChampSelect({ data }: { data: ChampSelectData }) {
  const { state } = data
  if (!state) return <EmptyState />

  const you = state.allies.find((p) => p.isLocalPlayer)
  const youChampId = you?.championId ?? 0

  return (
    <div style={{ padding: '22px 18px 50px', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Badge intent="info">{state.phase || 'Champ select'}</Badge>
        {state.timeLeftSec > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
            {state.timeLeftSec}s
          </span>
        )}
      </div>

      <BansRow bans={state.bans} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 20, alignItems: 'start', marginBottom: 24 }}>
        <TeamColumn players={state.allies} side="ally" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 26 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wght' 800, 'wdth' 78", fontSize: 30, color: 'var(--text-faint)' }}>VS</span>
          <Icon name="swords" size={20} style={{ color: 'var(--text-faint)' }} />
        </div>
        <TeamColumn players={state.enemies} side="enemy" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <Icon name="sparkles" size={16} style={{ color: 'var(--gold-400)' }} />
        <span className="eyebrow" style={{ fontSize: 12 }}>Corky's read on this game</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ReadCard icon="crosshair" title="Build & runes" accent="accent">
          {state.build ? (
            <Hint>{state.build.coreItems.join(' → ')}</Hint>
          ) : (
            <Hint>{youChampId > 0 ? 'Loading the best build for your champion…' : 'Lock in your champion to load the recommended build and runes.'}</Hint>
          )}
        </ReadCard>

        <ReadCard icon="swords" title="Lane matchup">
          {state.matchup ? (
            <Hint>{state.matchup.tips[0]}</Hint>
          ) : (
            <Hint>The matchup read loads once your lane opponent has picked.</Hint>
          )}
        </ReadCard>
      </div>
    </div>
  )
}
