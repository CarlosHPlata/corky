import { useEffect, useState } from 'react'
import { Card } from '../../core/Card'
import { ChampAvatar } from '../../ChampAvatar'
import * as dd from '../../../utils/ddragon'
import { ensureLoadoutDataLoaded } from '../../../utils/ddragon'
import { ROLE_ABBR, goldK, fmtDmg, code3 } from './format'
import type {
  Matchup as MatchupData, RosterEntry, TeamObjectives, FramingOutput,
} from '@shared/types'

// ── FACTUAL: full-width post-game scoreboard (US2) ───────────────────────────
// Two stacked team blocks, each row carrying the player's loadout (spells,
// runes, 6 item slots + trinket) and stat line (K/D/A, KDA, CS, KP, damage).
// All numbers come straight off the stored match; names/icons resolve via Data
// Dragon and degrade to the static code maps below when offline.

// Static fallbacks so the scoreboard stays legible without Data Dragon.
const SPELL_FALLBACK: Record<number, { code: string; name: string }> = {
  1: { code: 'CL', name: 'Cleanse' }, 3: { code: 'EX', name: 'Exhaust' }, 4: { code: 'F', name: 'Flash' },
  6: { code: 'GH', name: 'Ghost' }, 7: { code: 'HL', name: 'Heal' }, 11: { code: 'SM', name: 'Smite' },
  12: { code: 'TP', name: 'Teleport' }, 13: { code: 'CLR', name: 'Clarity' }, 14: { code: 'IG', name: 'Ignite' },
  21: { code: 'BR', name: 'Barrier' }, 32: { code: 'MK', name: 'Mark' },
}
const TREE_INFO: Record<number, { name: string; tone: string }> = {
  8000: { name: 'Precision', tone: 'var(--gold-400)' },
  8100: { name: 'Domination', tone: 'var(--red-400)' },
  8200: { name: 'Sorcery', tone: 'var(--blue-400)' },
  8300: { name: 'Inspiration', tone: 'var(--violet-400)' },
  8400: { name: 'Resolve', tone: 'var(--teal-400)' },
}
const KEYSTONE_FALLBACK: Record<number, string> = {
  8005: 'Press the Attack', 8008: 'Lethal Tempo', 8010: 'Conqueror', 8021: 'Fleet Footwork',
  8112: 'Electrocute', 8128: 'Dark Harvest', 9923: 'Hail of Blades',
  8214: 'Summon Aery', 8229: 'Arcane Comet', 8230: 'Phase Rush',
  8351: 'Glacial Augment', 8360: 'Unsealed Spellbook', 8369: 'First Strike',
  8437: 'Grasp of the Undying', 8439: 'Aftershock', 8465: 'Guardian',
}

function SpellIcon({ id }: { id: number }) {
  const name = dd.spellName(id) ?? SPELL_FALLBACK[id]?.name ?? (id ? `Spell ${id}` : 'Unknown')
  const url = dd.spellImgUrl(id)
  return (
    <span className="ck-sb-spell" title={name}>
      {url ? <img src={url} alt={name} /> : SPELL_FALLBACK[id]?.code ?? '·'}
    </span>
  )
}

function RuneCircle({ perkId, styleId, kind }: { perkId?: number | null; styleId: number | null; kind: 'key' | 'sec' }) {
  const tree = styleId != null ? TREE_INFO[styleId] : undefined
  const treeName = (styleId != null ? dd.styleName(styleId) : null) ?? tree?.name
  const tone = tree?.tone ?? 'var(--text-faint)'
  if (kind === 'key') {
    const name = (perkId != null ? dd.runeName(perkId) ?? KEYSTONE_FALLBACK[perkId] : null) ?? 'Keystone'
    const url = perkId != null ? dd.runeImgUrl(perkId) : null
    return (
      <span className="ck-rune ck-rune--key" title={treeName ? `${name} · ${treeName}` : name} style={{ border: `1px solid ${tone}` }}>
        {url ? <img src={url} alt={name} /> : code3(name)}
      </span>
    )
  }
  const name = treeName ?? 'Secondary'
  const url = styleId != null ? dd.styleImgUrl(styleId) : null
  return (
    <span className="ck-rune ck-rune--sec" title={`${name} (secondary)`} style={{ border: `1.5px solid ${tone}`, color: tone }}>
      {url ? <img src={url} alt={name} /> : code3(name)}
    </span>
  )
}

function ItemSlot({ id, trinket = false }: { id: number; trinket?: boolean }) {
  const base = trinket ? 'ck-sb-trinket' : 'ck-sb-item'
  if (!id) {
    return <span className={`${base} ${trinket ? 'ck-sb-trinket--empty' : 'ck-sb-item--empty'}`} title="Empty slot" />
  }
  const name = dd.itemName(id)
  const url = dd.itemImgUrl(id)
  return (
    <span className={trinket ? base : `${base} ck-sb-item--filled`} title={name ?? `Item ${id}`}>
      {url ? <img src={url} alt={name ?? `Item ${id}`} /> : name ? code3(name) : ''}
    </span>
  )
}

function ScoreRow({ e, tone, teamKills, maxDmg, mvp }: {
  e: RosterEntry; tone: string; teamKills: number; maxDmg: number; mvp: boolean
}) {
  const kdaRatio = ((e.kills + e.assists) / Math.max(1, e.deaths)).toFixed(2)
  const kp = Math.round(((e.kills + e.assists) / Math.max(1, teamKills)) * 100)
  const barPct = maxDmg > 0 ? Math.max(7, Math.round((e.damageToChampions / maxDmg) * 100)) : 0
  return (
    <div className={'ck-sb-row' + (e.isYou ? ' ck-sb-row--you' : '')}>
      <div className="ck-sb-load">
        <span className="ck-sb-portrait">
          <ChampAvatar name={e.champion} size="md" shape="rounded" ring={e.isYou ? 'accent' : tone} />
          {e.champLevel > 0 && <span className="ck-sb-level">{e.champLevel}</span>}
        </span>
        <span className="ck-sb-spells">
          {e.summonerSpellIds.map((id, i) => <SpellIcon key={i} id={id} />)}
        </span>
        <span className="ck-sb-keys">
          <RuneCircle perkId={e.keystoneId} styleId={e.primaryStyleId} kind="key" />
          <RuneCircle styleId={e.subStyleId} kind="sec" />
        </span>
      </div>
      <div className="ck-sb-who">
        <div className="ck-sb-pname" style={e.isLaneOpponent ? { color: 'var(--data-enemy)' } : undefined}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.champion}</span>
          {e.isYou && <span className="ck-mtag" style={{ color: 'var(--gold-400)' }}>YOU</span>}
          {e.isLaneOpponent && <span className="ck-mtag" style={{ color: 'var(--data-enemy)' }}>LANE</span>}
          {mvp && <span className="ck-sb-mvp">MVP</span>}
        </div>
        <div className="ck-sb-sub">
          {ROLE_ABBR[e.role] ?? e.role.toUpperCase()}{e.riotId ? ` · ${e.riotId}` : ''}
        </div>
      </div>
      <div className="ck-sb-items">
        {e.itemIds.map((id, i) => <ItemSlot key={i} id={id} />)}
        <ItemSlot id={e.trinketId} trinket />
      </div>
      <div className="ck-sb-stat ck-sb-stat--kda">
        <div className="ck-sb-line">{e.kills} / {e.deaths} / {e.assists}</div>
        <div className="ck-sb-sub2">{kdaRatio} KDA</div>
      </div>
      <div className="ck-sb-stat ck-sb-stat--cs">
        <div className="ck-sb-line">{e.cs} CS</div>
        <div className="ck-sb-sub2">{kp}% KP</div>
      </div>
      <div className="ck-sb-stat ck-sb-stat--dmg">
        <div className="ck-sb-line">{fmtDmg(e.damageToChampions)}</div>
        <div className="ck-sb-bar"><span style={{ width: `${barPct}%`, background: tone }} /></div>
      </div>
    </div>
  )
}

function TeamBlock({ title, side, rows, won, objectives, maxDmg, mvp }: {
  title: string; side: 'ally' | 'enemy'; rows: RosterEntry[]; won: boolean
  objectives: TeamObjectives | null; maxDmg: number; mvp: FramingOutput['mvp'] | null
}) {
  const tone = side === 'ally' ? 'var(--data-ally)' : 'var(--data-enemy)'
  const tk = rows.reduce((s, e) => s + e.kills, 0)
  const td = rows.reduce((s, e) => s + e.deaths, 0)
  const ta = rows.reduce((s, e) => s + e.assists, 0)
  const gold = rows.reduce((s, e) => s + e.gold, 0)
  const dmg = rows.reduce((s, e) => s + e.damageToChampions, 0)
  return (
    <div className={`ck-sb-team ck-sb-team--${side}`}>
      <div className="ck-sb-thead">
        <span className={`ck-sb-res ck-sb-res--${won ? 'win' : 'loss'}`}>{won ? 'Victory' : 'Defeat'}</span>
        <span className="ck-sb-tname" style={{ color: tone }}>{title}</span>
        <span className="ck-sb-totals">
          <span><b>{tk}</b> / <b>{td}</b> / <b>{ta}</b></span>
          {objectives && (
            <span className="ck-sb-obj">
              <span title="Towers">T {objectives.towers}</span>
              <span title="Dragons">D {objectives.dragons}</span>
              <span title="Barons">B {objectives.barons}</span>
            </span>
          )}
          <span><b>{goldK(gold)}</b> gold</span>
          {dmg > 0 && <span><b>{fmtDmg(dmg)}</b> dmg</span>}
        </span>
      </div>
      <div className="ck-sb-rows">
        {rows.map((e, i) => (
          <ScoreRow key={i} e={e} tone={tone} teamKills={tk} maxDmg={maxDmg}
            mvp={!!mvp && mvp.teamId === e.teamId && mvp.champion === e.champion} />
        ))}
      </div>
    </div>
  )
}

export function Matchup({ matchup, win, mvp }: {
  matchup: MatchupData; win: boolean; mvp: FramingOutput['mvp'] | null
}) {
  // Resolve item/spell/rune names + icons once per session; re-render when in.
  const [, setDdLoaded] = useState(false)
  useEffect(() => { ensureLoadoutDataLoaded().then(() => setDdLoaded(true)) }, [])

  const maxDmg = Math.max(0, ...matchup.allies.map(e => e.damageToChampions), ...matchup.enemies.map(e => e.damageToChampions))
  return (
    <Card padding={0} className="ck-sb">
      <TeamBlock title="Your team" side="ally" rows={matchup.allies} won={win}
        objectives={matchup.allyObjectives} maxDmg={maxDmg} mvp={mvp} />
      <TeamBlock title="Enemy team" side="enemy" rows={matchup.enemies} won={!win}
        objectives={matchup.enemyObjectives} maxDmg={maxDmg} mvp={mvp} />
      {!matchup.laneOpponent && (
        <div className="ck-sb-note">
          No fixed lane opponent this game — your role roams rather than holding a single lane.
        </div>
      )}
    </Card>
  )
}
