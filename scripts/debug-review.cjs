// One-off debug: inspect stored match analyses (review section status) from a
// copy of the live DB. Usage: node scripts/debug-review.cjs <path-to-db>
const Database = require('better-sqlite3')
const db = new Database(process.argv[2], { readonly: true })

const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name)
console.log('tables:', tables.join(', '))

const analysisTable = tables.find((t) => /match_analys/i.test(t))
if (!analysisTable) {
  console.log('no match-analysis table found')
  process.exit(0)
}
const cols = db.prepare(`PRAGMA table_info(${analysisTable})`).all().map((c) => c.name)
console.log(`${analysisTable} columns:`, cols.join(', '))

const rows = db.prepare(`SELECT * FROM ${analysisTable}`).all()
for (const row of rows) {
  // find the JSON column
  const jsonCol = Object.keys(row).find((k) => typeof row[k] === 'string' && row[k].trim().startsWith('{'))
  let sections = null, generatedAt = null, models = ''
  try {
    const parsed = JSON.parse(row[jsonCol])
    sections = parsed.sections
    generatedAt = parsed.generatedAt
    models = `${parsed.lightModel ?? '?'} / ${parsed.heavyModel ?? '?'}`
  } catch {}
  console.log(
    row.matchId ?? row.match_id,
    generatedAt ? new Date(generatedAt).toISOString() : '',
    JSON.stringify(sections),
    models
  )
}
