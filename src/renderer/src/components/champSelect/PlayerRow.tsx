import type { CSSProperties } from 'react'
import { ChampAvatar } from '../ChampAvatar'
import { Icon } from '../Icon'
import type { ChampSelectPlayer } from '@shared/types'
import { champNameById } from '../../utils/ddragon'
import { championOf, roleLabel } from './format'
import { SpellIcon } from './SpellIcon'

const styles = {
  row: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', minHeight: 56,
    borderRadius: 'var(--radius-md)', transition: 'border-color 120ms'
  }
} satisfies Record<string, CSSProperties>

/** Row chrome that depends on the player's pick/lock state and team side. */
function rowStyle(p: ChampSelectPlayer, ally: boolean, hovered: boolean): CSSProperties {
  // The bright "acting" border is reserved for the local player — LCU marks
  // every player mid-action, so without this gate it lights up the whole lobby.
  const youActing = p.isActing && p.isLocalPlayer
  return {
    ...styles.row,
    background: p.isLocalPlayer ? 'var(--accent-soft)' : 'var(--bg-card)',
    border: `1px solid ${youActing ? 'var(--gold-400)' : p.isLocalPlayer ? 'rgba(242,179,61,0.35)' : 'var(--border-subtle)'}`,
    flexDirection: ally ? 'row' : 'row-reverse',
    textAlign: ally ? 'left' : 'right',
    opacity: hovered ? 0.6 : 1
  }
}

export function PlayerRow({ p, side }: { p: ChampSelectPlayer; side: 'ally' | 'enemy' }) {
  const ally = side === 'ally'
  const champ = championOf(p)
  const champName = champ ? champNameById(champ.id) : null
  const ring = p.isLocalPlayer ? 'accent' : ally ? 'info' : 'loss'

  return (
    <div style={rowStyle(p, ally, champ?.hovered ?? false)}>
      {champName ? (
        <ChampAvatar name={champName} size="sm" shape="rounded" ring={ring} />
      ) : (
        <span style={{
          width: 36, height: 36, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center',
          background: 'var(--bg-app)', border: `1px dashed ${p.isActing ? 'var(--gold-400)' : 'var(--border-subtle)'}`,
          color: 'var(--text-faint)'
        }}>
          {p.isActing && <Icon name="refresh-cw" size={14} className="ck-spin" />}
        </span>
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>
          {champName ?? (p.isActing ? 'Picking…' : '—')}
          {p.isLocalPlayer && <span style={{ color: 'var(--gold-400)', fontSize: 11, marginLeft: 6 }}>You</span>}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
          {roleLabel(p.assignedPosition) || (ally && p.gameName) || (ally ? '' : 'Hidden')}
        </div>
      </div>

      {ally && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {p.summonerSpellIds.map((s, i) => <SpellIcon key={i} id={s} />)}
        </div>
      )}
    </div>
  )
}
