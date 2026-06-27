import { Icon } from '../Icon'
import { Hint } from './Hint'

export function EmptyState() {
  return (
    <div style={{ padding: '60px 18px', maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
      <Icon name="swords" size={28} style={{ color: 'var(--text-faint)' }} />
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginTop: 14 }}>
        Not in champion select
      </div>
      <Hint>Corky opens here automatically and jumps to the front the moment your next champ select begins.</Hint>
    </div>
  )
}
