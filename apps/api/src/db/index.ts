import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../env.js";

export const BUILTIN_SERVER_ID = "default";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

export function initDatabase(): void {
  const dir = dirname(config.dbPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      api_url TEXT NOT NULL DEFAULT '',
      metrics_url TEXT NOT NULL DEFAULT '',
      auth TEXT NOT NULL DEFAULT '',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_secrets (
      server_id TEXT NOT NULL,
      username TEXT NOT NULL,
      secret TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (server_id, username),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );
  `);

  seedBuiltinServer();
}

function seedBuiltinServer(): void {
  const database = getDb();
  const existing = database
    .prepare("SELECT id FROM servers WHERE id = ?")
    .get(BUILTIN_SERVER_ID);
  if (existing) return;

  database
    .prepare(
      `INSERT INTO servers (id, name, api_url, metrics_url, auth, is_builtin, sort_order)
       VALUES (?, 'Default', '', '', '', 1, 0)`,
    )
    .run(BUILTIN_SERVER_ID);

  const active = database
    .prepare("SELECT value FROM app_settings WHERE key = 'active_server_id'")
    .get() as { value: string } | undefined;
  if (!active) {
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('active_server_id', ?)",
      )
      .run(BUILTIN_SERVER_ID);
  }
}

export function resolveServerIdFromRequest(
  headers: Record<string, string | string[] | undefined>,
): string {
  const raw = headers["x-telemt-server-id"];
  const id = typeof raw === "string" ? raw.trim() : "";
  if (id) return id;

  const apiUrl = headers["x-telemt-api-url"];
  if (typeof apiUrl === "string" && apiUrl.trim()) {
    const row = getDb()
      .prepare("SELECT id FROM servers WHERE api_url = ? LIMIT 1")
      .get(apiUrl.trim().replace(/\/$/, "")) as { id: string } | undefined;
    if (row) return row.id;
  }

  return BUILTIN_SERVER_ID;
}
