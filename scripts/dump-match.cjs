// One-off debug: dump everything the review pass consumes for one match to a
// JSON file, so a node/vitest repro can rebuild the exact prompt without sqlite.
// Usage (Electron node mode): electron scripts/dump-match.cjs <db> <matchId> <out.json>
const Database = require('better-sqlite3')
const fs = require('fs')
const [, , dbPath, matchId, outPath] = process.argv
const db = new Database(dbPath, { readonly: true })

const match = db.prepare('SELECT * FROM matches WHERE match_id = ?').get(matchId)
const timeline = db.prepare('SELECT * FROM timelines WHERE match_id = ?').get(matchId)
const account = db.prepare('SELECT * FROM account LIMIT 1').get()
const goal = db.prepare('SELECT * FROM session_goal LIMIT 1').get()
const profile = db.prepare('SELECT * FROM summoner_profile LIMIT 1').get()
const analysis = db.prepare('SELECT * FROM match_analyses WHERE match_id = ?').get(matchId)
const config = db.prepare('SELECT * FROM coaching_config LIMIT 1').get()
const reflections = db.prepare('SELECT * FROM reflections WHERE match_id = ?').all(matchId)

fs.writeFileSync(
  outPath,
  JSON.stringify({ match, timeline, account, goal, profile, analysis, config, reflections }, null, 2)
)
console.log('wrote', outPath)
console.log('match cols:', match ? Object.keys(match).join(', ') : 'NOT FOUND')
console.log('analysis status:', analysis ? analysis.status : 'none')
