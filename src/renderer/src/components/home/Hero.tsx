import { Card } from '../core/Card'
import { Button } from '../core/Button'
import { Avatar } from '../core/Avatar'
import { Icon } from '../Icon'
import type { MatchSummary, SummonerProfile } from '@shared/types'
import { rankLabel, relativeTime } from '../../utils/format'
import { profileIconUrl } from '../../utils/ddragon'
import type { Screen } from './format'

// Hero: identity + recent form pips.
export function Hero({ profile, matches, net, onNav }: {
  profile: SummonerProfile; matches: MatchSummary[]; net: number | null; onNav: (s: Screen) => void
}) {
  const wins = matches.filter(m => m.win).length
  const form = [...matches].reverse()
  const rank = rankLabel(profile.soloRank)
  const lp = profile.soloRank?.leaguePoints
  const icon = profileIconUrl(profile.profileIconId)

  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '20px 22px', minWidth: 280 }}>
          <Avatar name={profile.gameName} src={icon ?? undefined} size="lg" ring="accent" />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 4 }}>Welcome back</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--text-primary)', lineHeight: 1.04 }}>
              {profile.gameName}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-faint)', fontWeight: 400, marginLeft: 7 }}>#{profile.tagLine}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: 'linear-gradient(150deg, var(--gold-400), var(--gold-600))', flex: 'none' }} />
                {rank}{lp != null ? ` · ${lp} LP` : ''}
              </span>
              {net != null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: net >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                  {net >= 0 ? '+' : '−'}{Math.abs(net)} LP this session
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 11, padding: '18px 22px', borderLeft: '1px solid var(--border-subtle)', minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="eyebrow" style={{ fontSize: 11 }}>Recent form</span>
            {matches.length > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--win)' }}>{wins}W</span>{' '}
                <span style={{ color: 'var(--loss)' }}>{matches.length - wins}L</span>
                <span style={{ color: 'var(--text-faint)' }}> · {Math.round((wins / matches.length) * 100)}%</span>
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => onNav('history')}
              iconRight={<Icon name="chevron-right" size={15} />} style={{ marginLeft: 'auto' }}>
              All games
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {form.length === 0 && (
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-faint)' }}>No games synced yet.</span>
            )}
            {form.map((m, i) => (
              <span key={i} title={`${m.champion} · ${m.win ? 'Win' : 'Loss'} · ${relativeTime(m.gameCreation)}`}
                style={{
                  flex: 1, height: 34, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
                  color: m.win ? 'var(--win)' : 'var(--loss)',
                  background: m.win ? 'var(--win-soft)' : 'var(--loss-soft)',
                  border: '1px solid ' + (m.win ? 'rgba(33,208,163,0.28)' : 'rgba(255,87,101,0.28)'),
                }}>
                {m.win ? 'W' : 'L'}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
