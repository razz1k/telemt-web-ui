import { getDb } from "./index.js";
import type { UserTrafficSnapshot } from "../metrics-parse.js";

export interface TrafficAccumulatedRow {
  server_id: string;
  username: string;
  accumulated_download_bytes: number;
  accumulated_upload_bytes: number;
  last_download_counter: number;
  last_upload_counter: number;
  updated_at: string;
}

function advanceCounter(
  accumulated: number,
  lastCounter: number,
  currentCounter: number,
): { accumulated: number; lastCounter: number } {
  if (currentCounter < lastCounter) {
    return {
      accumulated: accumulated + lastCounter,
      lastCounter: currentCounter,
    };
  }
  const delta = currentCounter - lastCounter;
  if (delta <= 0) {
    return { accumulated, lastCounter: currentCounter };
  }
  return {
    accumulated: accumulated + delta,
    lastCounter: currentCounter,
  };
}

export function applyTrafficSnapshot(
  serverId: string,
  liveByUser: Map<string, UserTrafficSnapshot>,
): void {
  const db = getDb();
  const select = db.prepare(
    `SELECT accumulated_download_bytes, accumulated_upload_bytes,
            last_download_counter, last_upload_counter
     FROM user_traffic_accumulated WHERE server_id = ? AND username = ?`,
  );
  const upsert = db.prepare(
    `INSERT INTO user_traffic_accumulated (
       server_id, username,
       accumulated_download_bytes, accumulated_upload_bytes,
       last_download_counter, last_upload_counter, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(server_id, username) DO UPDATE SET
       accumulated_download_bytes = excluded.accumulated_download_bytes,
       accumulated_upload_bytes = excluded.accumulated_upload_bytes,
       last_download_counter = excluded.last_download_counter,
       last_upload_counter = excluded.last_upload_counter,
       updated_at = excluded.updated_at`,
  );

  const tx = db.transaction(() => {
    for (const username of liveByUser.keys()) {
      const live = liveByUser.get(username) ?? {
        downloadBytes: 0,
        uploadBytes: 0,
      };
      const prev = select.get(serverId, username) as
        | {
            accumulated_download_bytes: number;
            accumulated_upload_bytes: number;
            last_download_counter: number;
            last_upload_counter: number;
          }
        | undefined;

      let accDl = prev?.accumulated_download_bytes ?? 0;
      let accUl = prev?.accumulated_upload_bytes ?? 0;
      let lastDl = prev?.last_download_counter ?? 0;
      let lastUl = prev?.last_upload_counter ?? 0;

      const dlStep = advanceCounter(accDl, lastDl, live.downloadBytes);
      accDl = dlStep.accumulated;
      lastDl = dlStep.lastCounter;

      const ulStep = advanceCounter(accUl, lastUl, live.uploadBytes);
      accUl = ulStep.accumulated;
      lastUl = ulStep.lastCounter;

      upsert.run(serverId, username, accDl, accUl, lastDl, lastUl);
    }
  });
  tx();
}

export function listAccumulatedTraffic(
  serverId: string,
): TrafficAccumulatedRow[] {
  return getDb()
    .prepare(
      `SELECT server_id, username, accumulated_download_bytes, accumulated_upload_bytes,
              last_download_counter, last_upload_counter, updated_at
       FROM user_traffic_accumulated WHERE server_id = ?
       ORDER BY username ASC`,
    )
    .all(serverId) as TrafficAccumulatedRow[];
}

export function formatAccumulatedPrometheus(serverId: string): string {
  const rows = listAccumulatedTraffic(serverId);
  if (rows.length === 0) return "";

  const lines = ["\n# ACCUMULATED (telemt-web-ui)"];
  for (const row of rows) {
    const user = row.username.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(
      `telemt_accumulated_tx{user="${user}"} ${row.accumulated_download_bytes}`,
    );
    lines.push(
      `telemt_accumulated_rx{user="${user}"} ${row.accumulated_upload_bytes}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function resetAccumulatedTraffic(
  serverId: string,
  username?: string,
): number {
  const db = getDb();
  if (username) {
    const result = db
      .prepare(
        "DELETE FROM user_traffic_accumulated WHERE server_id = ? AND username = ?",
      )
      .run(serverId, username);
    return result.changes;
  }
  const result = db
    .prepare("DELETE FROM user_traffic_accumulated WHERE server_id = ?")
    .run(serverId);
  return result.changes;
}
