import React, { useEffect, useState } from 'react'
import { Card } from '../components/core/Card'
import { Toggle } from '../components/core/Toggle'
import { Button } from '../components/core/Button'
import { Icon } from '../components/Icon'
import type { SummonerProfile } from '@shared/types'
import type { BudgetTier, ContextBlockInfo, DataSourceInfo, ResolvedCoachingConfig } from '@shared/config'
import { rankLabel } from '../utils/format'
import { useCoachingConfig } from '../data/useCoachingConfig'

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

const monoChipStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.4, whiteSpace: 'nowrap',
  color: 'var(--text-muted)', background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1px 6px',
}

function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s
}

function AccountRows() {
  const [profile, setProfile] = useState<SummonerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    window.api.getSummonerProfile()
      .then(p => { if (!cancelled) setProfile(p) })
      .catch(() => { /* treated as no account synced */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 0' }}>
        <Icon name="refresh-cw" size={14} className="ck-spin" style={{ color: 'var(--text-faint)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>Loading account…</span>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 0' }}>
        <Icon name="history" size={14} style={{ color: 'var(--text-faint)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
          No account synced yet — sync from Home.
        </span>
      </div>
    )
  }

  const rank = rankLabel(profile.soloRank)
  const lp = profile.soloRank?.leaguePoints

  return (
    <>
      <Row label="Riot ID"><span style={fieldStyle}>{profile.gameName}#{profile.tagLine}</span></Row>
      <Row label="Region"><span style={fieldStyle}>{profile.platform.toUpperCase()} · {titleCase(profile.region)}</span></Row>
      <Row label="Solo rank"><span style={fieldStyle}>{rank}{lp != null ? ` · ${lp} LP` : ''}</span></Row>
    </>
  )
}

/* ---------- Coaching configuration ------------------------------------- */

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600,
      letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
      color: 'var(--text-faint)', padding: '14px 0 4px',
    }}>
      {children}
    </div>
  )
}

function LoadingRows({ message }: { message: string }) {
  return (
    <div style={{ padding: '14px 0', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
      {message}
    </div>
  )
}

/** Shared two-column row: stacked label/description/extras left, control right. */
function ConfigRow({ dimmed = false, left, right }: { dimmed?: boolean; left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      padding: '11px 0', borderBottom: '1px solid var(--border-subtle)',
      opacity: dimmed ? 0.45 : 1,
    }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>{left}</div>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center' }}>{right}</div>
    </div>
  )
}

function LockNote({ text }: { text: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 200, textAlign: 'right',
      fontFamily: 'var(--font-sans)', fontSize: 11.5, lineHeight: 1.4, color: 'var(--text-faint)',
    }}>
      <Icon name="lock" size={12} style={{ flex: 'none' }} />
      {text}
    </span>
  )
}

const SOURCE_GROUPS: { kind: DataSourceInfo['kind']; label: string }[] = [
  { kind: 'mcp', label: 'MCP servers' },
  { kind: 'riot-api', label: 'Riot API' },
  { kind: 'local', label: 'Local' },
]

function SourceRow({ source, onChange }: { source: DataSourceInfo; onChange: (on: boolean) => void }) {
  return (
    <ConfigRow
      left={
        <>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>{source.label}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.45, color: 'var(--text-muted)' }}>{source.description}</span>
          {source.usedBy.length > 0 && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {source.usedBy.map(u => <span key={u} style={monoChipStyle}>{u}</span>)}
            </span>
          )}
        </>
      }
      right={
        source.lockedReason
          ? <LockNote text={source.lockedReason} />
          : <Toggle checked={source.enabled} onChange={onChange} />
      }
    />
  )
}

function DataSourcesCard({ config, loading, setSource }: {
  config: ResolvedCoachingConfig | null
  loading: boolean
  setSource: (id: string, on: boolean) => void
}) {
  return (
    <Card title="Data sources" eyebrow="What the coach may consult" padding={18}>
      {!config
        ? <LoadingRows message={loading ? 'Loading…' : 'Configuration unavailable.'} />
        : SOURCE_GROUPS.map(group => {
            const sources = config.sources.filter(s => s.kind === group.kind)
            if (sources.length === 0) return null
            return (
              <React.Fragment key={group.kind}>
                <GroupHeader>{group.label}</GroupHeader>
                {sources.map(s => (
                  <SourceRow key={s.id} source={s} onChange={on => setSource(s.id, on)} />
                ))}
              </React.Fragment>
            )
          })}
    </Card>
  )
}

const BLOCK_GROUP_LABELS: Record<string, string> = {
  match: 'Match',
  player: 'Player',
  carry: 'Analysis carry-over',
}
const KNOWN_BLOCK_GROUP_ORDER = ['match', 'player', 'carry']

/** Known groups first, in fixed order; unknown future groups appended in first-appearance order. */
function orderedBlockGroups(blocks: ContextBlockInfo[]): string[] {
  const present = new Set(blocks.map(b => b.group))
  const ordered = KNOWN_BLOCK_GROUP_ORDER.filter(g => present.has(g))
  for (const b of blocks) {
    if (!ordered.includes(b.group)) ordered.push(b.group)
  }
  return ordered
}

function BlockRow({ block, dimmed, dimNote, setBlock }: {
  block: ContextBlockInfo
  dimmed: boolean
  dimNote: string | null
  setBlock: (id: string, on: boolean) => void
}) {
  return (
    <ConfigRow
      dimmed={dimmed}
      left={
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>{block.label}</span>
            <span style={monoChipStyle}>~{block.typicalTokens} tok</span>
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.45, color: 'var(--text-muted)' }}>{block.description}</span>
          {dimNote && (
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--text-faint)' }}>needs {dimNote}</span>
          )}
        </>
      }
      right={
        block.alwaysOn
          ? <LockNote text="always on" />
          : <Toggle checked={block.enabled} disabled={dimmed} onChange={on => setBlock(block.id, on)} />
      }
    />
  )
}

const TIERS: { id: BudgetTier; label: string }[] = [
  { id: 'eco', label: 'Eco' },
  { id: 'standard', label: 'Standard' },
  { id: 'deep', label: 'Deep' },
]

function TierSegment({ tier, setTier }: { tier: BudgetTier; setTier: (t: BudgetTier) => void }) {
  return (
    <div style={{
      display: 'inline-flex', gap: 2, padding: 3,
      background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
    }}>
      {TIERS.map(t => {
        const active = t.id === tier
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => { if (!active) setTier(t.id) }}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, lineHeight: 1,
              padding: '6px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: `1px solid ${active ? 'rgba(242,179,61,0.28)' : 'transparent'}`,
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--gold-300)' : 'var(--text-muted)',
              transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function ContextBlocksCard({ config, loading, setBlock, setTier }: {
  config: ResolvedCoachingConfig | null
  loading: boolean
  setBlock: (id: string, on: boolean) => void
  setTier: (t: BudgetTier) => void
}) {
  const sourceById = new Map((config?.sources ?? []).map(s => [s.id, s]))
  const isDimmed = (b: ContextBlockInfo): boolean =>
    !!b.requiresSource && sourceById.get(b.requiresSource)?.enabled === false

  const totalTokens = (config?.blocks ?? [])
    .filter(b => b.enabled && !isDimmed(b))
    .reduce((sum, b) => sum + b.typicalTokens, 0)

  return (
    <Card title="Context data points" eyebrow="What each match feeds the model" padding={18}>
      {!config
        ? <LoadingRows message={loading ? 'Loading…' : 'Configuration unavailable.'} />
        : (
          <>
            {orderedBlockGroups(config.blocks).map(group => (
              <React.Fragment key={group}>
                <GroupHeader>{BLOCK_GROUP_LABELS[group] ?? group}</GroupHeader>
                {config.blocks.filter(b => b.group === group).map(b => {
                  const dimmed = isDimmed(b)
                  const dimNote = dimmed && b.requiresSource
                    ? (sourceById.get(b.requiresSource)?.label ?? b.requiresSource)
                    : null
                  return <BlockRow key={b.id} block={b} dimmed={dimmed} dimNote={dimNote} setBlock={setBlock} />
                })}
              </React.Fragment>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 14 }}>
              <TierSegment tier={config.budgetTier} setTier={setTier} />
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-muted)' }}>Context per analysis</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  ~{totalTokens} tok
                </span>
              </span>
            </div>
          </>
        )}
    </Card>
  )
}

export function Settings() {
  const { config, loading, setSource, setBlock, setTier, restoreDefaults } = useCoachingConfig()

  return (
    <div className="ck-fade" style={{ padding: '22px 18px', maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card title="Account" eyebrow="Riot ID" padding={18}>
        <AccountRows />
      </Card>
      <DataSourcesCard config={config} loading={loading} setSource={setSource} />
      <ContextBlocksCard config={config} loading={loading} setBlock={setBlock} setTier={setTier} />
      <div>
        <Button variant="danger" size="sm" disabled={!config?.modified} onClick={restoreDefaults}>
          Restore all defaults
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '12px 14px', background: 'var(--win-soft)', border: '1px solid rgba(33,208,163,0.22)', borderRadius: 'var(--radius-md)' }}>
        <Icon name="shield" size={16} style={{ color: 'var(--win)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Corky only reads information the game already shows you. Keys stay on this machine and never touch game files.
        </span>
      </div>
    </div>
  )
}
