import { spellImgUrl } from '../../utils/ddragon'

export function SpellIcon({ id }: { id: number }) {
  const url = id > 0 ? spellImgUrl(id) : null
  return (
    <span
      style={{
        width: 18, height: 18, borderRadius: 4, flex: 'none',
        background: url ? `center/cover url(${url})` : 'var(--bg-card)',
        border: '1px solid var(--border-subtle)'
      }}
    />
  )
}
