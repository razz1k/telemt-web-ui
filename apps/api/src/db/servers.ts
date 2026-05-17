import { randomUUID } from "node:crypto";
import { config } from "../env.js";
import { BUILTIN_SERVER_ID, getDb } from "./index.js";

export interface ServerRow {
  id: string;
  name: string;
  api_url: string;
  metrics_url: string;
  auth: string;
  is_builtin: number;
  sort_order: number;
}

export interface ServerDto {
  id: string;
  name: string;
  apiUrl: string;
  metricsUrl: string;
  auth: string;
  builtin?: boolean;
  /** Filled from container env when builtin URLs in DB are empty */
  envDefaults?: { apiUrl: string; metricsUrl: string };
}

function rowToDto(row: ServerRow): ServerDto {
  return {
    id: row.id,
    name: row.name,
    apiUrl: row.api_url,
    metricsUrl: row.metrics_url,
    auth: row.auth,
    ...(row.is_builtin
      ? {
          builtin: true,
          envDefaults: {
            apiUrl: config.telemtApiUrl,
            metricsUrl: config.telemtMetricsUrl,
          },
        }
      : {}),
  };
}

export function listServers(): { servers: ServerDto[]; activeServerId: string } {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM servers ORDER BY is_builtin DESC, sort_order ASC, name ASC",
    )
    .all() as ServerRow[];

  const activeRow = db
    .prepare("SELECT value FROM app_settings WHERE key = 'active_server_id'")
    .get() as { value: string } | undefined;

  let activeServerId = activeRow?.value ?? BUILTIN_SERVER_ID;
  if (!rows.some((r) => r.id === activeServerId)) {
    activeServerId = rows.find((r) => r.is_builtin)?.id ?? rows[0]?.id ?? BUILTIN_SERVER_ID;
    setActiveServerId(activeServerId);
  }

  return {
    servers: rows.map(rowToDto),
    activeServerId,
  };
}

export function getServerById(id: string): ServerDto | null {
  const row = getDb()
    .prepare("SELECT * FROM servers WHERE id = ?")
    .get(id) as ServerRow | undefined;
  return row ? rowToDto(row) : null;
}

export function createServer(input: {
  name: string;
  apiUrl: string;
  metricsUrl: string;
  auth: string;
}): ServerDto {
  const db = getDb();
  const id = randomUUID();
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM servers WHERE is_builtin = 0")
    .get() as { m: number };

  db.prepare(
    `INSERT INTO servers (id, name, api_url, metrics_url, auth, is_builtin, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  ).run(
    id,
    input.name.trim(),
    input.apiUrl.trim(),
    input.metricsUrl.trim(),
    input.auth.trim(),
    maxOrder.m + 1,
  );

  setActiveServerId(id);
  return getServerById(id)!;
}

export function updateServer(
  id: string,
  patch: Partial<{ name: string; apiUrl: string; metricsUrl: string; auth: string }>,
): ServerDto | null {
  const existing = getDb()
    .prepare("SELECT * FROM servers WHERE id = ?")
    .get(id) as ServerRow | undefined;
  if (!existing) return null;

  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  const apiUrl = patch.apiUrl !== undefined ? patch.apiUrl.trim() : existing.api_url;
  const metricsUrl =
    patch.metricsUrl !== undefined ? patch.metricsUrl.trim() : existing.metrics_url;
  const auth = patch.auth !== undefined ? patch.auth.trim() : existing.auth;

  getDb()
    .prepare(
      `UPDATE servers SET name = ?, api_url = ?, metrics_url = ?, auth = ? WHERE id = ?`,
    )
    .run(name, apiUrl, metricsUrl, auth, id);

  return getServerById(id);
}

export function deleteServer(id: string): boolean {
  const row = getDb()
    .prepare("SELECT is_builtin FROM servers WHERE id = ?")
    .get(id) as { is_builtin: number } | undefined;
  if (!row || row.is_builtin) return false;

  const db = getDb();
  db.prepare("DELETE FROM servers WHERE id = ?").run(id);

  const active = db
    .prepare("SELECT value FROM app_settings WHERE key = 'active_server_id'")
    .get() as { value: string } | undefined;
  if (active?.value === id) {
    setActiveServerId(BUILTIN_SERVER_ID);
  }
  return true;
}

export function setActiveServerId(id: string): void {
  const exists = getDb()
    .prepare("SELECT id FROM servers WHERE id = ?")
    .get(id);
  if (!exists) return;

  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES ('active_server_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(id);
}
