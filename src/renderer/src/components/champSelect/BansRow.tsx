import type { ChampSelectBan } from '@shared/types'
import { champNameById, champImgUrlById } from '../../utils/ddragon'

export function BansRow({ bans }: { bans: ChampSelectBan[] }) {
  if (bans.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
      <span className="eyebrow" style={{ fontSize: 11, color: 'var(--text-faint)' }}>Bans</span>
      {bans.map((b, i) => {
        const url = champImgUrlById(b.championId)
        return (
          <span key={i} title={champNameById(b.championId) ?? undefined} style={{
            width: 26, height: 26, borderRadius: 5, flex: 'none', position: 'relative',
            background: url ? `center/cover url(${url})` : 'var(--bg-card)',
            border: `1px solid ${b.team === 'ally' ? 'var(--blue-400)' : 'var(--red-400)'}`,
            filter: 'grayscale(0.6)', opacity: 0.85
          }}>
            <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--red-400)', fontSize: 16, fontWeight: 700 }}>⁄</span>
          </span>
        )
      })}
    </div>
  )
}
