import React, { useCallback, useEffect, useRef, useState } from 'react'
import { VerdictCard } from '../components/coaching/VerdictCard'
import { FocusTask } from '../components/coaching/FocusTask'
import { TurningPoint } from '../components/coaching/TurningPoint'
import { MatchTimeline } from '../components/coaching/MatchTimeline'
import { Badge } from '../components/core/Badge'
import { Card } from '../components/core/Card'
import { StatBlock } from '../components/core/StatBlock'
import { Button } from '../components/core/Button'
import { ChampAvatar } from '../components/ChampAvatar'
import { CoachChat } from '../components/CoachChat'
import { ReflectionsPanel } from '../components/coaching/ReflectionsPanel'
import { Askable, AskBadge, type AddRef } from '../components/coaching/AskRef'
import { Icon } from '../components/Icon'
import { useMatchReport } from '../data/useMatchReport'
import { useMatchAnalysis } from '../data/useMatchAnalysis'
import { useReflections } from '../data/useReflections'
import { formatDuration, queueLabel } from '../utils/format'
import type {
  MatchReport, MatchCore, Matchup as MatchupData, Breakdown as BreakdownData,
  GoldTimeline, DeathMap as DeathMapData, Highlight, RosterEntry, DeathNarration,
  EvidenceRef,
} from '@shared/types'

// Corky desktop — Post-game report.
//
// Two layers live here:
//   • FACTUAL (this feature, spec 003) — scoreline, matchup, gold timeline +
//     deterministic highlights, the breakdown block, and the death map. Read
//     straight off the stored match via `getMatchReport`. No analysis needed.
//   • CORKY'S READ — the AI verdict, turning points, focus tasks and since-last.
//     Still gated behind "Run analysis" and sourced from the mock layer until
//     Flow A wires it. This feature does NOT feed those sections.

const ROLE_ABBR: Record<string, string> = {
  Top: 'TOP', Jungle: 'JNG', Mid: 'MID', Bot: 'BOT', Support: 'SUP',
}

function fmtClock(tMin: number): string {
  const m = Math.floor(tMin)
  const s = Math.round((tMin - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function goldK(gold: number): string {
  return (gold / 1000).toFixed(1) + 'k'
}

function goldDiffK(n: number): string {
  return (n >= 0 ? '+' : '−') + Math.abs(n / 1000).toFixed(1) + 'k'
}

// A readable chip label for a claim's evidence anchor (e.g. "stat:gold_at_24" → "gold at 24").
function evidenceLabel(ref: { id: string; label?: string }): string {
  return ref.label ?? ref.id.replace(/^(stat|marker):/, '').replace(/[_#]/g, ' ').trim()
}

function SectionLabel({ icon, children, count }: { icon?: string; children: React.ReactNode; count?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 12px' }}>
      {icon && <Icon name={icon} size={16} style={{ color: 'var(--gold-400)' }} />}
      <span className="eyebrow" style={{ fontSize: 12 }}>{children}</span>
      {count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)' }}>{count}</span>}
    </div>
  )
}

// Inline "run analysis to see this" placeholder — stands in for any AI-written block.
function GatedBlock({ title, hint, analyzing, onAnalyze }: { title: string; hint: string; analyzing: boolean; onAnalyze: () => void }) {
  return (
    <div className="ck-gated">
      <span className="ck-gated__icon"><Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={19} className={analyzing ? 'ck-spin' : ''} /></span>
      <div className="ck-gated__body">
        <div className="ck-gated__dots">· · · · ·</div>
        <div className="ck-gated__title">{title}</div>
        <div className="ck-gated__hint">{hint}</div>
      </div>
      <Button variant="secondary" size="sm" onClick={onAnalyze} disabled={analyzing}
        iconLeft={<Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={14} className={analyzing ? 'ck-spin' : ''} />}
        style={{ flex: 'none' }}>
        {analyzing ? 'Analysing…' : 'Run analysis'}
      </Button>
    </div>
  )
}

// A stat anchor ref, minted with the exact key + label grammar of the main-side
// anchorCatalog (`stat:<key>`), so chat grounding resolves it 1:1.
function statRef(key: string, label: string): EvidenceRef {
  return { id: `stat:${key}`, kind: 'stat', label }
}

// ── FACTUAL: scoreline economy (US2) ─────────────────────────────────────────
function Scoreline({ core, onAsk }: { core: MatchCore; onAsk?: AddRef }) {
  const stats = [
    { label: 'KDA', value: core.kdaRatio.toFixed(2), caption: `${core.kills} / ${core.deaths} / ${core.assists}`, ref: statRef('kda', 'KDA ratio') },
    { label: 'CS', value: String(core.cs), caption: `${core.role.toLowerCase()} farm`, ref: statRef('cs', 'CS') },
    { label: 'CS / min', value: core.csPerMin.toFixed(1), caption: 'minions + jungle', ref: statRef('cs_per_min', 'CS per minute') },
    { label: 'Gold', value: goldK(core.gold), caption: 'earned total', ref: statRef('gold', 'Total gold') },
    { label: 'Gold / min', value: String(core.goldPerMin), caption: 'economy rate', ref: statRef('gold_per_min', 'Gold per minute') },
  ]
  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '16px 20px', minWidth: 196 }}>
          <ChampAvatar name={core.champion} size="lg" shape="rounded" ring={core.win ? 'win' : 'loss'} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: 11, color: core.win ? 'var(--win)' : 'var(--loss)', marginBottom: 3 }}>
              {core.role} · {core.win ? 'Victory' : 'Defeat'}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 21, color: 'var(--text-primary)', lineHeight: 1.05 }}>
              {core.champion}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {formatDuration(core.durationSec)} · {queueLabel(core.queue)}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 22, padding: '16px 22px', borderLeft: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          {stats.map(({ ref, ...s }, i) => (
            <Askable key={i} evidence={ref} onAsk={onAsk}>
              <StatBlock size="sm" {...s} />
            </Askable>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ── FACTUAL: lane-by-lane matchup (US2) ──────────────────────────────────────
function statLine(e: RosterEntry): string {
  return `${e.kills}/${e.deaths}/${e.assists} · ${e.cs} cs · ${goldK(e.gold)}`
}

function Matchup({ matchup }: { matchup: MatchupData }) {
  const rows = matchup.allies.map((a, i) => ({ a, e: matchup.enemies[i] as RosterEntry | undefined }))
  return (
    <Card padding={16}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 1fr', alignItems: 'center', gap: '0 12px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--data-ally)', flex: 'none' }} />
          <span className="eyebrow" style={{ fontSize: 11, color: 'var(--blue-400)' }}>Your team</span>
        </div>
        <span />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
          <span className="eyebrow" style={{ fontSize: 11, color: 'var(--red-400)' }}>Enemy</span>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--data-enemy)', flex: 'none' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(({ a, e }, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 56px 1fr', alignItems: 'center', gap: '0 12px',
            padding: '6px 8px', borderRadius: 'var(--radius-md)',
            background: a.isYou ? 'rgba(242,179,61,0.07)' : 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <ChampAvatar name={a.champion} size="sm" shape="rounded" ring={a.isYou ? 'accent' : 'var(--data-ally)'} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.champion}
                  {a.isYou && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--gold-400)', marginLeft: 7, letterSpacing: '0.04em' }}>YOU</span>}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{statLine(a)}</div>
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textAlign: 'center' }}>
              {ROLE_ABBR[a.role] ?? a.role.toUpperCase()}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', minWidth: 0 }}>
              <div style={{ minWidth: 0, textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: e?.isLaneOpponent ? 'var(--data-enemy)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e?.isLaneOpponent && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--data-enemy)', marginRight: 7, letterSpacing: '0.04em' }}>LANE</span>}
                  {e?.champion ?? '—'}
                </div>
                {e && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{statLine(e)}</div>}
              </div>
              {e && <ChampAvatar name={e.champion} size="sm" shape="rounded" ring="var(--data-enemy)" />}
            </div>
          </div>
        ))}
      </div>
      {!matchup.laneOpponent && (
        <div style={{ marginTop: 10, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-faint)' }}>
          No fixed lane opponent this game — your role roams rather than holding a single lane.
        </div>
      )}
    </Card>
  )
}

// ── FACTUAL: the decided-by-numbers breakdown (US2) ──────────────────────────
function nr(v: number | null, fmt: (n: number) => string): string {
  return v == null ? '—' : fmt(v)
}

function Breakdown({ b, onAsk }: { b: BreakdownData; onAsk?: AddRef }) {
  const stats: { label: string; value: string; caption: string; unit?: string; ref: EvidenceRef }[] = [
    { label: 'CS @ 10', value: nr(b.csAt10, String), caption: 'minions at 10:00', ref: statRef('cs_at_10', 'CS at 10:00') },
    { label: 'CS / min', value: b.csPerMin.toFixed(1), caption: 'full game', ref: statRef('cs_per_min', 'CS per minute') },
    { label: 'Gold @ 14', value: nr(b.goldAt14, goldDiffK), caption: 'vs lane opponent', ref: statRef('gold_at_14', 'Gold diff at 14:00') },
    { label: 'Gold @ 24', value: nr(b.goldAt24, goldDiffK), caption: 'vs lane opponent', ref: statRef('gold_at_24', 'Gold diff at 24:00') },
    { label: 'Vision', value: String(b.visionScore), caption: 'vision score', ref: statRef('vision_score', 'Vision score') },
    { label: 'Solo deaths', value: String(b.soloDeaths), caption: 'died alone', ref: statRef('solo_deaths', 'Solo deaths') },
    { label: 'Kill part.', value: Math.round(b.killParticipation * 100) + '%', caption: 'of team kills', ref: statRef('kill_participation', 'Kill participation') },
  ]
  return (
    <Card padding={16}>
      <div className="eyebrow" style={{ fontSize: 11, marginBottom: 14 }}>Breakdown</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '18px 14px' }}>
        {stats.map(({ ref, ...s }, i) => (
          <Askable key={i} evidence={ref} onAsk={onAsk}>
            <StatBlock size="sm" {...s} />
          </Askable>
        ))}
      </div>
    </Card>
  )
}

// ── FACTUAL death map (US4) + per-death narration (pass 2) ───────────────────
// The map positions are facts; the narration ("caught out", "why it mattered")
// is Corky's read. Click a death to read its note — the narration is keyed by
// `marker:death#n`, the same n the map plots.
const DEATH_CHARACTER: Record<DeathNarration['character'], { label: string; tone: string }> = {
  caught_out: { label: 'Caught out', tone: 'var(--loss)' },
  overextended: { label: 'Overextended', tone: 'var(--warn)' },
  fair_fight: { label: 'Fair fight', tone: 'var(--text-muted)' },
  objective_trade: { label: 'Traded for an objective', tone: 'var(--gold-400)' },
  unclear: { label: 'Unclear', tone: 'var(--text-faint)' },
}

function deathNarrationByN(narrations?: DeathNarration[]): Map<number, DeathNarration> {
  const m = new Map<number, DeathNarration>()
  for (const dn of narrations ?? []) {
    const match = /death#(\d+)/.exec(dn.ref.id)
    if (match) m.set(Number(match[1]), dn)
  }
  return m
}

// The ref for one player death — same id grammar the anchorCatalog mints
// (`marker:death#<n>`, 1-based n straight off the death-map dot).
function deathRef(n: number): EvidenceRef {
  return { id: `marker:death#${n}`, kind: 'marker', label: `Death ${n}` }
}

function DeathMap({ dm, narrations, onActiveDeath, onAsk }: {
  dm: DeathMapData; narrations?: DeathNarration[]; onActiveDeath?: (tMin: number | null) => void; onAsk?: AddRef
}) {
  const byN = deathNarrationByN(narrations)
  const hasNarr = byN.size > 0
  const [sel, setSel] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => { setSel(null); setHover(null) }, [dm])

  // The death currently in focus (hover wins over click). Pushed up so the
  // timeline can mark the same moment.
  const activeN = hover ?? sel
  useEffect(() => {
    const d = activeN != null ? dm.deaths.find(x => x.n === activeN) : undefined
    onActiveDeath?.(d ? d.tMin : null)
  }, [activeN, dm, onActiveDeath])

  const selected = sel != null ? byN.get(sel) : undefined

  return (
    <Card padding={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Death map</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{dm.count} {dm.count === 1 ? 'death' : 'deaths'}</span>
      </div>
      {dm.count === 0 ? (
        <div style={{ padding: '24px 8px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
          <Icon name="shield" size={16} style={{ color: 'var(--win)', verticalAlign: 'middle', marginRight: 8 }} />
          A deathless game — nothing to map.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14 }}>
            <div className="ck-minimap" style={{ width: 150, height: 150, flex: 'none' }}>
              <div className="ck-minimap__grid" />
              {dm.deaths.map(d => (
                <span key={d.n} className="ck-minimap__death"
                  onClick={hasNarr ? () => setSel(d.n) : undefined}
                  onMouseEnter={() => setHover(d.n)} onMouseLeave={() => setHover(h => (h === d.n ? null : h))}
                  onContextMenu={onAsk ? (e) => { e.preventDefault(); onAsk(deathRef(d.n)) } : undefined}
                  title={onAsk ? 'Right-click to ask Corky about this death' : undefined}
                  style={{ left: d.xPct + '%', top: d.yPct + '%', background: 'var(--loss)', cursor: 'pointer', outline: activeN === d.n ? '2px solid var(--gold-400)' : 'none' }}>
                  {d.n}
                </span>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {dm.deaths.map(d => {
                const narr = byN.get(d.n)
                const isActive = activeN === d.n
                const hoverProps = {
                  onMouseEnter: () => setHover(d.n),
                  onMouseLeave: () => setHover(h => (h === d.n ? null : h)),
                  onContextMenu: onAsk
                    ? (e: React.MouseEvent) => { e.preventDefault(); onAsk(deathRef(d.n)) }
                    : undefined,
                }
                const row = (
                  <>
                    <span className="ck-death-n" style={{ background: 'var(--loss)' }}>{d.n}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtClock(d.tMin)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: narr ? DEATH_CHARACTER[narr.character].tone : 'var(--text-faint)' }}>
                      {narr ? DEATH_CHARACTER[narr.character].label : `death ${d.n} of ${dm.count}`}
                    </span>
                    {onAsk && (
                      <AskBadge evidence={deathRef(d.n)} onAsk={onAsk} visible={isActive}
                        style={{ marginLeft: 'auto' }} />
                    )}
                  </>
                )
                return narr ? (
                  <button key={d.n} onClick={() => setSel(sel === d.n ? null : d.n)} {...hoverProps}
                    style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '4px 6px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: isActive ? 'rgba(242,179,61,0.10)' : 'transparent' }}>
                    {row}
                  </button>
                ) : (
                  <div key={d.n} {...hoverProps}
                    style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '4px 6px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      background: isActive ? 'rgba(242,179,61,0.10)' : 'transparent' }}>
                    {row}
                  </div>
                )
              })}
            </div>
          </div>
          {hasNarr && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2, rgba(255,255,255,0.03))', borderLeft: '2px solid var(--gold-400)' }}>
              {selected ? (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: DEATH_CHARACTER[selected.character].tone }}>{DEATH_CHARACTER[selected.character].label}</strong> — {selected.text}
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-faint)' }}>
                  <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)', verticalAlign: 'middle', marginRight: 6 }} />
                  Click a death to read Corky’s note on it.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// Map a factual highlight to the timeline component's event vocabulary, minting
// each event's evidence anchor with the EXACT id grammar of the main-side
// anchorCatalog: highlights numbered per bucket in report order, death-kind
// highlights counted in the "swing" bucket (`marker:objective#1`,
// `marker:teamfight#2`, `marker:swing#1`, …).
function toTimelineEvents(hl: Highlight[]) {
  const counters: Record<string, number> = {}
  return hl.map(h => {
    const bucket = h.kind === 'death' ? 'swing' : h.kind
    const n = (counters[bucket] = (counters[bucket] ?? 0) + 1)
    const ref: EvidenceRef = { id: `marker:${bucket}#${n}`, kind: 'marker', label: h.label }
    return { t: h.tMin, kind: h.kind, label: h.label, detail: h.detail, ref }
  })
}

function UnavailableNote({ what }: { what: string }) {
  return (
    <Card padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
        <Icon name="history" size={15} style={{ color: 'var(--text-faint)', flex: 'none' }} />
        {what} isn’t available for this game — Corky doesn’t have its detailed timeline stored.
      </div>
    </Card>
  )
}

// -------------------------------------------------------------- notepad
function loadNote(key: string): string {
  try {
    const raw = localStorage.getItem(key)
    if (raw) { const v = JSON.parse(raw); return typeof v === 'string' ? v : (v.text || '') }
  } catch { /* ignore */ }
  return ''
}
function saveNote(key: string, text: string) { try { localStorage.setItem(key, JSON.stringify(text)) } catch { /* ignore */ } }

function NotePad({ storeKey, accent = 'info', placeholder }: { storeKey: string; accent?: 'info' | 'accent'; placeholder: string }) {
  const [text, setText] = useState<string>(() => loadNote(storeKey))
  const [draft, setDraft] = useState<string>(text)
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { const t = loadNote(storeKey); setText(t); setDraft(t); setEditing(false) }, [storeKey])

  const hasText = !!text.trim()
  const open = editing || !hasText

  function commit() { const t = draft.trim(); setText(t); saveNote(storeKey, t); setEditing(false) }
  function cancel() { setDraft(text); setEditing(false) }
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
    else if (e.key === 'Escape' && hasText) { e.preventDefault(); cancel() }
  }
  useEffect(() => {
    if (open && ref.current) {
      ref.current.focus()
      const v = ref.current.value; ref.current.setSelectionRange(v.length, v.length)
    }
  }, [open])

  if (open) {
    return (
      <Card accent={accent} padding={16}>
        <textarea ref={ref} className="ck-field" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} rows={4}
          placeholder={placeholder}
          style={{ fontFamily: 'var(--font-sans)', fontSize: 14.5, lineHeight: 1.6, resize: 'vertical', minHeight: 92 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
          <Button variant="primary" size="sm" onClick={commit} disabled={!draft.trim()} iconLeft={<Icon name="check" size={15} />}>Save</Button>
          {hasText && <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>⌘⏎ to save{hasText ? ' · Esc to cancel' : ''}</span>
        </div>
      </Card>
    )
  }

  return (
    <Card accent={accent} padding={16}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <p style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14.5,
          color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</p>
        <Button variant="ghost" size="sm" onClick={() => { setDraft(text); setEditing(true) }} iconLeft={<Icon name="pencil" size={14} />} style={{ flex: 'none' }}>Edit</Button>
      </div>
    </Card>
  )
}

// --------------------------------------------------------------- pin store
function loadPins(): string[] { try { return JSON.parse(localStorage.getItem('ck-pinned-games') || '[]') } catch { return [] } }
function savePins(a: string[]) { try { localStorage.setItem('ck-pinned-games', JSON.stringify(a)) } catch { /* ignore */ } }

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}

// --------------------------------------------------------------- the report
export function CoachReport({ matchId, onAnalyzed }: {
  matchId: string; analyzed?: boolean; onAnalyzed?: () => void
}) {
  const { report, loading, notFound, error } = useMatchReport(matchId)

  // AI analysis ("Corky's read"). Restored on open from the stored read (no model
  // call); runs the real four-pass pipeline on demand (spec 004).
  const { analysis, state, run, apply } = useMatchAnalysis(matchId)
  const analyzing = state === 'running'
  const runAnalyze = (): void => run()
  // Notify the host once a read is in (keeps any host-level "analyzed" flag in sync).
  useEffect(() => { if (analysis?.review) onAnalyzed?.() }, [analysis?.review, onAnalyzed])

  // Death ↔ timeline link: the time (mins) of the death currently hovered/clicked
  // in the death map, so the timeline marks the same moment.
  const [activeDeathTime, setActiveDeathTime] = useState<number | null>(null)

  // Pending chat references — evidence the player picked off the report ("ask
  // Corky about this"). Lifted here so every report element can add, while the
  // chat composer renders/removes/sends them. Capped at 5 (the main-side
  // grounding cap); duplicate ids are no-ops. A ref mirror keeps `addRef` able
  // to report whether the add actually landed (drives the ✓-flash feedback).
  const [pendingRefs, setPendingRefs] = useState<EvidenceRef[]>([])
  const pendingMirror = useRef<EvidenceRef[]>([])
  const setPending = useCallback((next: EvidenceRef[]) => {
    pendingMirror.current = next
    setPendingRefs(next)
  }, [])
  useEffect(() => { pendingMirror.current = []; setPendingRefs([]) }, [matchId])
  const addRef = useCallback((ref: EvidenceRef): boolean => {
    const cur = pendingMirror.current
    if (cur.length >= 5 || cur.some(r => r.id === ref.id)) return false
    setPending(cur.concat({ ...ref }))
    return true
  }, [setPending])
  const removeRef = useCallback((id: string) => {
    setPending(pendingMirror.current.filter(r => r.id !== id))
  }, [setPending])
  const clearRefs = useCallback(() => { setPending([]) }, [setPending])

  // Reflections — the player's takeaways for this game (spec 005). Manual
  // authoring is model-free; coach-authored ones land via accepted proposals,
  // so the chat pings `reload` when one of its accepts touched the list.
  const reflectionsApi = useReflections(matchId)

  // Pin / save the game.
  const [pinned, setPinned] = useState(() => loadPins().includes(matchId))
  useEffect(() => { setPinned(loadPins().includes(matchId)) }, [matchId])
  function togglePin() {
    const a = loadPins(); const i = a.indexOf(matchId)
    if (i >= 0) a.splice(i, 1); else a.push(matchId)
    savePins(a); setPinned(i < 0)
  }

  if (loading) {
    return <CenteredNote><Icon name="refresh-cw" size={18} className="ck-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />Loading this game…</CenteredNote>
  }
  if (error) {
    return <CenteredNote><Icon name="shield" size={18} style={{ color: 'var(--loss)', verticalAlign: 'middle', marginRight: 8 }} />Couldn’t read this match.</CenteredNote>
  }
  if (notFound || !report) {
    return <CenteredNote>That match isn’t stored locally. Sync your games and try again.</CenteredNote>
  }

  const core = report.core
  // Each pass owns its own section; a section is bound only when its pass produced
  // it (FR-002a). Unbuilt/failed/skipped sections fall back to the gated prompt.
  const framing = analysis?.framing ?? null
  const review = analysis?.review ?? null
  const narration = analysis?.narration ?? null
  const tasks = analysis?.tasks ?? null
  const analyzed = !!review
  const sinceLast = tasks?.sinceLast ?? []
  const sinceWins = sinceLast.filter(t => t.result === 'improved' || t.result === 'held').length
  const sinceApplicable = sinceLast.filter(t => t.result !== 'not_applicable').length

  const PinBtn = (
    <Button variant={pinned ? 'secondary' : 'ghost'} size="sm" onClick={togglePin}
      iconLeft={<Icon name={pinned ? 'bookmark' : 'pin'} size={14} style={pinned ? { color: 'var(--gold-400)' } : undefined} />}>
      {pinned ? 'Saved' : 'Pin game'}
    </Button>
  )

  return (
    <div style={{ padding: '22px 18px 60px', maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* Verdict — Corky's read, gated. Card frame + W/L + identity are facts. */}
      <VerdictCard result={core.win ? 'win' : 'loss'} champion={core.champion}
        duration={formatDuration(core.durationSec)} queue={queueLabel(core.queue)}
        eyebrow={analyzed ? 'Verdict' : 'Not analysed yet'}
        tags={analyzed && review
          ? <>{framing && <Badge intent={framing.headlineTagIntent}>{framing.headlineTag}</Badge>}<Badge intent="neutral">{review.cohort}</Badge>{PinBtn}</>
          : <><Button variant="primary" size="sm" onClick={runAnalyze} disabled={analyzing}
                iconLeft={<Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={15} className={analyzing ? 'ck-spin' : ''} />}>
                {analyzing ? 'Analysing…' : 'Analyze this match'}
              </Button>{PinBtn}</>}>
        {analyzed && review
          ? <>{review.verdict.lead} {review.verdict.gild && <em>{review.verdict.gild}</em>}</>
          : <span style={{ color: 'var(--text-faint)' }}>
              <span className="ck-inline-dots" style={{ fontSize: 22 }}>· · · · ·</span>
              <span style={{ display: 'block', marginTop: 8, fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}>
                Run analysis to see why this game went the way it did. Your scoreline, matchup, gold timeline and death map are ready below.
              </span>
            </span>}
      </VerdictCard>

      {/* Scoreline — facts; MVP caption is a framing decoration (pass 1). */}
      <section>
        <SectionLabel icon="bar-chart-3">This game</SectionLabel>
        <Scoreline core={core} onAsk={addRef} />
        {framing?.mvp && (
          <div style={{ marginTop: 8, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)' }}>
            <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)', verticalAlign: 'middle', marginRight: 6 }} />
            MVP: <strong style={{ color: 'var(--text-secondary)' }}>{framing.mvp.champion}{framing.mvp.isYou ? ' (you)' : ''}</strong> — {framing.mvp.justification}
          </div>
        )}
      </section>

      {/* Matchup — facts; tips are a framing decoration (pass 1). */}
      <section>
        <SectionLabel icon="swords">Matchup</SectionLabel>
        <Matchup matchup={report.matchup} />
        {framing && framing.matchupTips.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {framing.matchupTips.map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)' }}>
                <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)', flex: 'none', marginTop: 2 }} />{tip}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Your reflections — raw note, always available */}
      <section>
        <SectionLabel icon="pen-line">Your reflections</SectionLabel>
        <NotePad storeKey={'ck-reflections-' + matchId}
          placeholder="How did that game feel? Raw thoughts — what you did well, what frustrated you, what you noticed…" />
      </section>

      {/* Evidence — timeline + breakdown + death map (all facts) */}
      <section>
        <SectionLabel icon="target">Evidence</SectionLabel>
        {report.timelineAvailable && report.timeline ? (
          <div style={{ marginBottom: 14 }}>
            <MatchTimeline
              duration={formatDuration(core.durationSec)}
              curve={report.timeline.frames.map(f => f.goldDiff / 1000)}
              events={toTimelineEvents(report.timeline.highlights)}
              markerTime={activeDeathTime}
              onAskEvent={addRef}
            />
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}><UnavailableNote what="The game timeline" /></div>
        )}
        <div style={{ marginBottom: 14 }}>
          <Breakdown b={report.breakdown} onAsk={addRef} />
        </div>
        {report.deathMap
          ? <DeathMap dm={report.deathMap} narrations={narration?.deathNarrations} onActiveDeath={setActiveDeathTime} onAsk={addRef} />
          : <UnavailableNote what="The death map" />}
      </section>

      {/* Turning points — AI read, gated. NOT chat-referenceable: they're model
          output with no entry in the main-side anchor catalog (which only mints
          ids for stats, spec-003 highlights and deaths), so any id minted here
          would ground as "not found". Point at the timeline marker instead. */}
      <section>
        <SectionLabel icon="map" count={narration ? `${narration.turningPoints.length} moments` : undefined}>Turning points</SectionLabel>
        {narration
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {narration.turningPoints.map((t, i) => <TurningPoint key={i} time={t.time} swing={t.swing} swingDir={t.dir} you={t.you} event={t.event} objective={t.objective} what={t.what} better={t.better} />)}
            </div>
          : report.timelineAvailable
            ? <GatedBlock title="The moments that decided the game" hint="Corky pinpoints each swing on the map and shows the better play." analyzing={analyzing} onAnalyze={runAnalyze} />
            : <UnavailableNote what="Turning points" />}
      </section>

      {/* Overall analysis — the heavy read (pass 3): why won/lost + what to improve. */}
      <section>
        <SectionLabel icon="sparkles">Overall analysis</SectionLabel>
        {review
          ? <Card padding={18}>
              <div className="eyebrow" style={{ fontSize: 11, marginBottom: 8, color: review.confidence === 'provisional' ? 'var(--warn)' : 'var(--gold-400)' }}>
                {core.win ? 'Why you won' : 'Why you lost'} · {review.cohort}{review.confidence === 'provisional' ? ' · provisional' : ''}
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-primary)', margin: '0 0 14px' }}>
                {review.verdict.lead} {review.verdict.gild && <em style={{ color: 'var(--text-secondary)' }}>{review.verdict.gild}</em>}
              </p>
              {review.improve && (
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(242,179,61,0.08)', borderLeft: '2px solid var(--gold-400)', marginBottom: review.claims.length ? 14 : 0 }}>
                  <Icon name="crosshair" size={15} style={{ color: 'var(--gold-400)', flex: 'none', marginTop: 2 }} />
                  <div>
                    <div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 3 }}>What to improve</div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{review.improve}</div>
                  </div>
                </div>
              )}
              {review.claims.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {review.claims.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)' }}>
                      <Icon name="check" size={13} style={{ color: 'var(--gold-400)', flex: 'none', alignSelf: 'center' }} />
                      <span style={{ flex: 1 }}>{c.text}</span>
                      <Badge intent="neutral">{evidenceLabel(c.ref)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          : <GatedBlock title="Corky’s read on why this game went the way it did" hint="The heavy analysis: what won or lost the game, and the one thing to change." analyzing={analyzing} onAnalyze={runAnalyze} />}
      </section>

      {/* Next-game focus — AI read, gated */}
      <section>
        <SectionLabel icon="crosshair">Next-game focus</SectionLabel>
        {tasks
          ? <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.standing.map((t) => <FocusTask key={t.id} description={t.description} metric={t.metric} comparator={t.comparator} target={t.target} scope={t.scope} result="pending" />)}
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-faint)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)' }} />
                Corky will check these automatically after your next game.
              </p>
            </>
          : <GatedBlock title="Focus tasks for your next game" hint="Analysis turns this game’s mistakes into a short, checkable to-do list." analyzing={analyzing} onAnalyze={runAnalyze} />}
      </section>

      {/* Since last game — AI read, gated */}
      <section>
        <SectionLabel icon="history">Since last game</SectionLabel>
        {tasks
          ? tasks.firstTime
            ? <Card padding={16}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>
                  This is your first analysed game — Corky starts tracking your focus tasks from here.
                </span>
              </Card>
            : <Card padding={16}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>
                    You held <strong style={{ color: 'var(--text-primary)' }}>{sinceWins} of {sinceApplicable}</strong> focus tasks from last game.
                  </span>
                  <Badge intent={sinceWins >= sinceApplicable ? 'win' : 'warn'} style={{ marginLeft: 'auto' }}>{sinceWins >= sinceApplicable ? 'On track' : 'Slipped one'}</Badge>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tasks.sinceLast.map((t, i) => <FocusTask key={i} {...t} />)}
                </div>
              </Card>
          : <GatedBlock title="How you did on last game’s focus tasks" hint="Analysis checks this game against the tasks Corky set you last time." analyzing={analyzing} onAnalyze={runAnalyze} />}
      </section>

      {/* Reflections — the player's takeaways for this game (spec 005). Not
          gated on analysis: manual authoring needs no model and works offline. */}
      <section>
        <SectionLabel icon="bookmark">Reflections</SectionLabel>
        <ReflectionsPanel
          reflections={reflectionsApi.reflections}
          pendingRefs={pendingRefs}
          onSave={reflectionsApi.save}
          onDelete={reflectionsApi.remove}
          onRemoveRef={removeRef}
          onClearRefs={clearRefs}
        />
      </section>

      {/* Coach Corky — a live coaching chat, only once Corky's read is in. The
          briefing (this game + Corky's read + your goal + reflections) is rebuilt
          server-side on open, so the chat coaches off THIS game. The coach can
          PROPOSE task and reflection changes; nothing applies until accepted. */}
      {analyzed && (
        <section>
          <SectionLabel icon="message-circle">Coach Corky</SectionLabel>
          {/* Keyed by match: an in-flight reply for game A must never land in
              game B's mounted transcript (the remount drops the continuation). */}
          <CoachChat key={matchId} matchId={matchId} core={core} review={review} standing={tasks?.standing ?? []}
            onTasksUpdated={apply} onReflectionsChanged={reflectionsApi.reload}
            pendingRefs={pendingRefs} onRemoveRef={removeRef} onClearRefs={clearRefs} />
        </section>
      )}
    </div>
  )
}
