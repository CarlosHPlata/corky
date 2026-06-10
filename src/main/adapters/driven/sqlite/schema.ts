import type Database from 'better-sqlite3'

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account (
      puuid       TEXT PRIMARY KEY,
      game_name   TEXT NOT NULL,
      tag_line    TEXT NOT NULL,
      platform    TEXT NOT NULL,
      region      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      match_id      TEXT PRIMARY KEY,
      puuid         TEXT NOT NULL,
      queue         INTEGER NOT NULL,
      champion      TEXT NOT NULL,
      win           INTEGER NOT NULL,
      game_creation INTEGER NOT NULL,
      game_duration INTEGER NOT NULL,
      raw_json      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timelines (
      match_id TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS summoner_profile (
      puuid           TEXT PRIMARY KEY,
      game_name       TEXT NOT NULL,
      tag_line        TEXT NOT NULL,
      platform        TEXT NOT NULL,
      region          TEXT NOT NULL,
      profile_icon_id INTEGER NOT NULL,
      summoner_level  INTEGER NOT NULL,
      queue_type      TEXT,
      tier            TEXT,
      division        TEXT,
      league_points   INTEGER,
      wins            INTEGER,
      losses          INTEGER,
      updated_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lp_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      puuid         TEXT NOT NULL,
      ts            INTEGER NOT NULL,
      tier          TEXT NOT NULL,
      division      TEXT NOT NULL,
      league_points INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_lp_snapshots_puuid_ts ON lp_snapshots (puuid, ts);

    CREATE TABLE IF NOT EXISTS features (
      match_id TEXT PRIMARY KEY,
      json     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coach_reports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id   TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      model      TEXT NOT NULL,
      content    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS focus_tasks (
      id          TEXT PRIMARY KEY,
      match_id    TEXT NOT NULL,
      description TEXT NOT NULL,
      metric      TEXT NOT NULL,
      comparator  TEXT NOT NULL,
      target      REAL NOT NULL,
      scope       TEXT NOT NULL,
      champion    TEXT,
      role        TEXT
    );

    CREATE TABLE IF NOT EXISTS task_evaluations (
      task_id             TEXT NOT NULL,
      evaluating_match_id TEXT NOT NULL,
      result              TEXT NOT NULL,
      actual_value        REAL,
      PRIMARY KEY (task_id, evaluating_match_id)
    );

    -- The full AI match analysis ("Corky's read"), one row per match (spec 004).
    -- Restored on report open with no model call (FR-027). Re-run replaces it; a
    -- partial run never overwrites a stored full read (guarded in the repo).
    CREATE TABLE IF NOT EXISTS match_analyses (
      match_id    TEXT PRIMARY KEY,
      created_at  INTEGER NOT NULL,
      light_model TEXT NOT NULL,
      heavy_model TEXT NOT NULL,
      status      TEXT NOT NULL,
      json        TEXT NOT NULL
    );

    -- The player's standing, global, per-user focus tasks (1–3 active) — spec 004
    -- US4. Distinct from the legacy per-match focus_tasks; evolved over time
    -- (hold/retire/add) rather than regenerated per game.
    CREATE TABLE IF NOT EXISTS standing_focus_tasks (
      id              TEXT PRIMARY KEY,
      puuid           TEXT NOT NULL,
      description     TEXT NOT NULL,
      metric          TEXT NOT NULL,
      comparator      TEXT NOT NULL,
      target          REAL NOT NULL,
      scope           TEXT NOT NULL,
      champion        TEXT,
      role            TEXT,
      status          TEXT NOT NULL,
      source_match_id TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_standing_tasks_puuid_status
      ON standing_focus_tasks (puuid, status);

    -- Latest Quick Analysis per account, so it survives resync and app restart.
    CREATE TABLE IF NOT EXISTS session_analyses (
      puuid      TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      model      TEXT NOT NULL,
      json       TEXT NOT NULL
    );

    -- The player's session goal + notes. Single global row (single-user app);
    -- available before any account is synced. Fed to the coach as stated intent.
    CREATE TABLE IF NOT EXISTS session_goal (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      goal       TEXT NOT NULL DEFAULT '',
      notes      TEXT NOT NULL DEFAULT '',
      updated_at INTEGER
    );
  `)
}
