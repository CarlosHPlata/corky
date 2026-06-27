import type { ChampSelectPlayer } from '@shared/types'
import { PlayerRow } from './PlayerRow'

export function TeamColumn({ players, side }: { players: ChampSelectPlayer[]; side: 'ally' | 'enemy' }) {
  const ally = side === 'ally'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: ally ? 'var(--data-ally)' : 'var(--data-enemy)' }} />
        <span className="eyebrow" style={{ color: ally ? 'var(--blue-400)' : 'var(--red-400)' }}>{ally ? 'Your team' : 'Enemy team'}</span>
      </div>
      {players.map((p) => <PlayerRow key={p.cellId} p={p} side={side} />)}
    </div>
  )
}
