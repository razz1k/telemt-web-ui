import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";
import { config } from "../env.js";
import { BUILTIN_SERVER_ID, getDb } from "./index.js";

const HEX32 = /^[0-9a-fA-F]{32}$/;

export function getSecretsForServer(serverId: string): Map<string, string> {
  const rows = getDb()
    .prepare("SELECT username, secret FROM user_secrets WHERE server_id = ?")
    .all(serverId) as { username: string; secret: string }[];

  return new Map(rows.map((r) => [r.username, r.secret]));
}

export function upsertUserSecret(
  serverId: string,
  username: string,
  secret: string,
): void {
  if (!HEX32.test(secret)) return;

  getDb()
    .prepare(
      `INSERT INTO user_secrets (server_id, username, secret, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(server_id, username) DO UPDATE SET
         secret = excluded.secret,
         updated_at = datetime('now')`,
    )
    .run(serverId, username, secret.toLowerCase());
}

export function deleteUserSecret(serverId: string, username: string): void {
  getDb()
    .prepare("DELETE FROM user_secrets WHERE server_id = ? AND username = ?")
    .run(serverId, username);
}

export async function syncSecretsFromConfig(
  serverId = BUILTIN_SERVER_ID,
): Promise<number> {
  const path = config.telemtConfigPath;
  if (!path || serverId !== BUILTIN_SERVER_ID) return 0;

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return 0;
  }

  const doc = parse(raw) as Record<string, unknown>;
  const access = doc.access;
  if (access === null || typeof access !== "object" || Array.isArray(access)) {
    return 0;
  }

  const users = (access as Record<string, unknown>).users;
  if (users === null || typeof users !== "object" || Array.isArray(users)) {
    return 0;
  }

  let count = 0;
  for (const [username, value] of Object.entries(users as Record<string, unknown>)) {
    const secret = typeof value === "string" ? value : String(value ?? "");
    if (HEX32.test(secret)) {
      upsertUserSecret(serverId, username, secret);
      count += 1;
    }
  }
  return count;
}

export function enrichUserList<T extends { username: string; secret?: string }>(
  users: T[],
  serverId: string,
): T[] {
  const secrets = getSecretsForServer(serverId);
  return users.map((user) => {
    const secret = secrets.get(user.username);
    return secret ? { ...user, secret } : user;
  });
}

export function extractAndStoreSecretFromResponse(
  serverId: string,
  path: string,
  method: string,
  body: unknown,
): void {
  if (!body || typeof body !== "object") return;
  const envelope = body as {
    ok?: boolean;
    data?: Record<string, unknown>;
  };
  if (!envelope.ok || !envelope.data) return;

  const data = envelope.data;

  if (path === "/v1/users" && method === "GET" && Array.isArray(data)) {
    return;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      storeFromUserPayload(serverId, item);
    }
    return;
  }

  const rotateMatch = /^\/v1\/users\/([^/]+)\/rotate-secret$/.exec(path);
  if (
    rotateMatch &&
    typeof data.secret === "string" &&
    HEX32.test(data.secret)
  ) {
    upsertUserSecret(
      serverId,
      decodeURIComponent(rotateMatch[1]),
      data.secret,
    );
    return;
  }

  if (typeof data.secret === "string" && HEX32.test(data.secret)) {
    const username =
      typeof data.username === "string"
        ? data.username
        : typeof (data.user as { username?: string } | undefined)?.username ===
            "string"
          ? (data.user as { username: string }).username
          : null;
    if (username) {
      upsertUserSecret(serverId, username, data.secret);
      return;
    }
  }

  storeFromUserPayload(serverId, data);
}

export function storeSecretFromRequestBody(
  serverId: string,
  path: string,
  method: string,
  body: unknown,
): void {
  if (method !== "PATCH" && method !== "POST") return;
  if (!body || typeof body !== "object") return;

  const payload = body as Record<string, unknown>;
  const secret = payload.secret;
  if (typeof secret !== "string" || !HEX32.test(secret)) return;

  const userMatch = /^\/v1\/users\/([^/]+)$/.exec(path);
  if (userMatch) {
    upsertUserSecret(serverId, decodeURIComponent(userMatch[1]), secret);
    return;
  }

  if (path === "/v1/users" && typeof payload.username === "string") {
    upsertUserSecret(serverId, payload.username, secret);
  }
}

export function deleteSecretForUserPath(serverId: string, path: string): void {
  const match = /^\/v1\/users\/([^/]+)$/.exec(path);
  if (match) {
    deleteUserSecret(serverId, decodeURIComponent(match[1]));
  }
}

function storeFromUserPayload(serverId: string, payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const row = payload as {
    username?: string;
    secret?: string;
    user?: { username?: string; secret?: string };
  };

  const secret = row.secret ?? row.user?.secret;
  const username = row.username ?? row.user?.username;
  if (username && typeof secret === "string" && HEX32.test(secret)) {
    upsertUserSecret(serverId, username, secret);
  }
}
