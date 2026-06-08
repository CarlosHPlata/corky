import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { runMigrations } from '../adapters/driven/sqlite/schema'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'corky.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    runMigrations(db)
  }
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}
