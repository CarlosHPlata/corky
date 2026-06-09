// Fixture generator for the Match Report feature (spec 003).
//
// These are SCHEMA-ACCURATE, deterministic match-v5 detail + timeline payloads
// (same field shapes Riot returns and the app stores as raw_json). They stand in
// for real captured games so the pure domain/report extractors are fully testable
// offline. To refresh from REAL games instead, copy matches.raw_json /
// timelines.raw_json rows out of the dev DB over these files (research D7) — the
// extractors and tests don't care which source produced the JSON.
//
// Run: `node test/fixtures/generate.mjs`

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const PLAYER_PUUID = 'PUUID_PLAYER'
const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
const ALLY_CHAMPS = ['Garen', 'LeeSin', 'Ahri', 'Jinx', 'Thresh']
const ENEMY_CHAMPS = ['Sett', 'Vi', 'Zed', 'Caitlyn', 'Lux']

// participantId → teamId (1-5 = team 100, 6-10 = team 200)
const teamOf = (pid) => (pid <= 5 ? 100 : 200)

/**
 * Build a match detail + timeline pair.
 * @param opts.matchId
 * @param opts.durationSec
 * @param opts.playerPid          participantId the stored player maps to
 * @param opts.playerWin
 * @param opts.team100Lead         gold the player-team(100) leads team 200 by, at game end (can be negative)
 * @param opts.includeChallenges   set false to exercise the kill-participation fallback
 * @param opts.objectives          extra timeline events (objective takes)
 * @param opts.playerDeaths        [{tMs, x, y, soloAllyFar}] player CHAMPION_KILL victims
 * @param opts.wipe                optional {tMs, victims:[pid...]} enemy team-wipe cluster
 */
function build(opts) {
  const {
    matchId, durationSec, playerPid, playerWin,
    team100Lead, includeChallenges = true, objectives = [], playerDeaths = [], wipe = null,
    queueId = 420
  } = opts

  const durMin = durationSec / 60
  const team100Win = playerWin === (teamOf(playerPid) === 100)

  // ---- participants (detail) ----
  const participants = []
  for (let pid = 1; pid <= 10; pid++) {
    const team = teamOf(pid)
    const idxInTeam = (pid - 1) % 5
    const isPlayer = pid === playerPid
    const champ = team === 100 ? ALLY_CHAMPS[idxInTeam] : ENEMY_CHAMPS[idxInTeam]
    const win = team === 100 ? team100Win : !team100Win
    // Simple, deterministic per-player stat lines.
    const kills = isPlayer ? 9 : 3 + (pid % 4)
    const deaths = isPlayer ? playerDeaths.length : 4 + (pid % 3)
    const assists = isPlayer ? 7 : 5 + (pid % 3)
    const cs = isPlayer ? Math.round(8.0 * durMin) : Math.round((5 + (pid % 4)) * durMin)
    const p = {
      participantId: pid,
      puuid: isPlayer ? PLAYER_PUUID : `PUUID_${pid}`,
      teamId: team,
      teamPosition: ROLES[idxInTeam],
      championName: champ,
      win,
      kills,
      deaths,
      assists,
      totalMinionsKilled: cs,
      neutralMinionsKilled: idxInTeam === 1 ? Math.round(2 * durMin) : 0, // jungler farms camps
      goldEarned: 500 + Math.round((isPlayer ? 470 : 380 + (pid % 4) * 15) * durMin),
      visionScore: isPlayer ? 28 : 15 + (pid % 10),
      ...(includeChallenges ? { challenges: { killParticipation: isPlayer ? 0.62 : 0.4 } } : {})
    }
    participants.push(p)
  }

  // Team total kills (for KP fallback math in tests).
  const team100Kills = participants.filter((p) => p.teamId === 100).reduce((s, p) => s + p.kills, 0)
  const team200Kills = participants.filter((p) => p.teamId === 200).reduce((s, p) => s + p.kills, 0)

  const detail = {
    metadata: { matchId, participants: participants.map((p) => p.puuid) },
    info: {
      queueId,
      gameCreation: 1_749_000_000_000,
      gameDuration: durationSec,
      participants,
      teams: [
        { teamId: 100, win: team100Win },
        { teamId: 200, win: !team100Win }
      ]
    }
  }

  // ---- timeline frames ----
  const frameCount = Math.floor(durMin) + 1 // 0..floor(min)
  const frames = []
  for (let f = 0; f < frameCount; f++) {
    const tMs = f * 60_000
    const min = f
    const participantFrames = {}
    // team 100 gold lead ramps linearly to team100Lead by the final frame.
    const leadNow = (team100Lead * min) / Math.max(1, durMin)
    for (let pid = 1; pid <= 10; pid++) {
      const team = teamOf(pid)
      const idxInTeam = (pid - 1) % 5
      const isPlayer = pid === playerPid
      const perMinGold = isPlayer ? 470 : 380 + (pid % 4) * 15
      const base = 500 + perMinGold * min
      const teamAdj = team === 100 ? leadNow / 5 : -leadNow / 5
      const totalGold = Math.round(base + teamAdj)
      const minionsKilled = Math.round((isPlayer ? 8.2 : 5 + (pid % 4)) * min)
      const jungleMinionsKilled = idxInTeam === 1 ? Math.round(2 * min) : 0
      // Lanes spread along the diagonal; positions in Riot world units (~0..14870).
      const lanePos = 1500 + idxInTeam * 2600
      participantFrames[String(pid)] = {
        participantId: pid,
        totalGold,
        minionsKilled,
        jungleMinionsKilled,
        position: { x: lanePos + (team === 100 ? -300 : 300), y: lanePos + (team === 100 ? -300 : 300) }
      }
    }
    frames.push({ timestamp: tMs, participantFrames, events: [] })
  }

  const frameAt = (tMs) => frames[Math.min(frames.length - 1, Math.round(tMs / 60_000))]

  // objective + building events
  for (const o of objectives) {
    frameAt(o.tMs).events.push(
      o.kind === 'inhibitor'
        ? { type: 'BUILDING_KILL', timestamp: o.tMs, buildingType: 'INHIBITOR_BUILDING', teamId: o.lostByTeam, killerId: o.killerId ?? 1 }
        : {
            type: 'ELITE_MONSTER_KILL',
            timestamp: o.tMs,
            killerId: o.killerId ?? 1,
            killerTeamId: o.team,
            monsterType: o.monsterType,
            ...(o.monsterSubType ? { monsterSubType: o.monsterSubType } : {})
          }
    )
  }

  // player deaths (CHAMPION_KILL with victimId = player)
  for (const d of playerDeaths) {
    frameAt(d.tMs).events.push({
      type: 'CHAMPION_KILL',
      timestamp: d.tMs,
      killerId: teamOf(playerPid) === 100 ? 8 : 3,
      victimId: playerPid,
      assistingParticipantIds: d.soloAllyFar ? [] : [],
      position: { x: d.x, y: d.y }
    })
    // For solo-vs-grouped detection the extractor reads ally positions from the
    // nearest frame; place an ally near the death when it should NOT be solo.
    if (!d.soloAllyFar) {
      const fr = frameAt(d.tMs)
      const allyPid = playerPid === 3 ? 4 : 3
      fr.participantFrames[String(allyPid)].position = { x: d.x + 600, y: d.y + 400 }
    } else {
      // shove all allies to the opposite corner so the player is clearly alone
      const fr = frameAt(d.tMs)
      for (let pid = 1; pid <= 10; pid++) {
        if (teamOf(pid) === teamOf(playerPid) && pid !== playerPid) {
          fr.participantFrames[String(pid)].position = { x: 13000, y: 13000 }
        }
      }
    }
  }

  // enemy team-wipe cluster (used by highlight tests via the big fixture too)
  if (wipe) {
    wipe.victims.forEach((vpid, i) => {
      frameAt(wipe.tMs).events.push({
        type: 'CHAMPION_KILL',
        timestamp: wipe.tMs + i * 2500,
        killerId: 3,
        victimId: vpid,
        assistingParticipantIds: [1, 2],
        position: { x: 9000, y: 9000 }
      })
    })
  }

  const timeline = {
    metadata: { matchId, participants: participants.map((p) => ({ participantId: p.participantId, puuid: p.puuid })) },
    info: {
      frameInterval: 60_000,
      participants: participants.map((p) => ({ participantId: p.participantId, puuid: p.puuid })),
      frames
    }
  }

  return { detail, timeline, meta: { team100Kills, team200Kills } }
}

function emit(name, detail, timeline) {
  writeFileSync(join(DIR, `match-${name}.json`), JSON.stringify(detail, null, 2))
  if (timeline) writeFileSync(join(DIR, `timeline-${name}.json`), JSON.stringify(timeline, null, 2))
}

// ---- WIN_001: 32-min win, player mid (pid 3), team ahead, full objective set + a wipe ----
const win = build({
  matchId: 'EUW1_WIN_001',
  durationSec: 1920,
  playerPid: 3,
  playerWin: true,
  team100Lead: 9600,
  objectives: [
    { tMs: 390_000, kind: 'monster', monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON', team: 100 },
    { tMs: 570_000, kind: 'monster', monsterType: 'RIFTHERALD', team: 100 },
    { tMs: 840_000, kind: 'monster', monsterType: 'DRAGON', monsterSubType: 'OCEAN_DRAGON', team: 100 },
    { tMs: 1_500_000, kind: 'monster', monsterType: 'BARON_NASHOR', team: 100 },
    { tMs: 1_680_000, kind: 'inhibitor', lostByTeam: 200, killerId: 3 }
  ],
  playerDeaths: [
    { tMs: 740_000, x: 7400, y: 7600, soloAllyFar: false }, // grouped death (fair fight)
    { tMs: 1_330_000, x: 3200, y: 9800, soloAllyFar: true } // solo death, alone in river
  ],
  wipe: { tMs: 1_440_000, victims: [6, 7, 8, 9] } // 4-man enemy wipe before Baron
})
emit('WIN_001', win.detail, win.timeline)

// ---- LOSS_002: 30-min loss, player mid, team behind ----
const loss = build({
  matchId: 'EUW1_LOSS_002',
  durationSec: 1800,
  playerPid: 3,
  playerWin: false,
  team100Lead: -8200,
  objectives: [
    { tMs: 420_000, kind: 'monster', monsterType: 'DRAGON', monsterSubType: 'CLOUD_DRAGON', team: 100 },
    { tMs: 1_480_000, kind: 'monster', monsterType: 'BARON_NASHOR', team: 200 },
    { tMs: 1_620_000, kind: 'inhibitor', lostByTeam: 100, killerId: 8 }
  ],
  playerDeaths: [
    { tMs: 1_330_000, x: 8200, y: 9100, soloAllyFar: true },
    { tMs: 1_650_000, x: 4200, y: 4400, soloAllyFar: true }
  ]
})
emit('LOSS_002', loss.detail, loss.timeline)

// ---- SHORT_003: 18-min remake-ish win, never reaches the 24-min breakpoint ----
const short = build({
  matchId: 'EUW1_SHORT_003',
  durationSec: 1080,
  playerPid: 3,
  playerWin: true,
  team100Lead: 5200,
  includeChallenges: false, // exercises the (k+a)/teamKills fallback
  objectives: [{ tMs: 390_000, kind: 'monster', monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON', team: 100 }],
  playerDeaths: [{ tMs: 600_000, x: 6000, y: 6000, soloAllyFar: false }]
})
emit('SHORT_003', short.detail, short.timeline)

// ---- JUNGLE_004: player is the jungler (pid 2) → no fixed lane opponent ----
const jungle = build({
  matchId: 'EUW1_JUNGLE_004',
  durationSec: 1800,
  playerPid: 2,
  playerWin: true,
  team100Lead: 3000,
  objectives: [],
  playerDeaths: [{ tMs: 600_000, x: 5000, y: 5000, soloAllyFar: false }]
})
emit('JUNGLE_004', jungle.detail, jungle.timeline)

console.log('Fixtures written to', DIR, '— meta:', { win: win.meta, loss: loss.meta, short: short.meta })
