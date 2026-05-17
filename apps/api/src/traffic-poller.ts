import { listServers } from "./db/servers.js";
import { applyTrafficSnapshot } from "./db/traffic.js";
import { parseLivePerUserTraffic } from "./metrics-parse.js";
import { fetchTelemtMetrics } from "./proxy.js";
import { resolveTargetForServer } from "./server-target.js";
import { config } from "./env.js";

let pollTimer: ReturnType<typeof setInterval> | null = null;
let polling = false;

export async function pollServerTraffic(
  log: { info: (o: unknown, msg?: string) => void; warn: (o: unknown, msg?: string) => void },
): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const { servers } = listServers();
    for (const server of servers) {
      const target = resolveTargetForServer(server);
      try {
        const result = await fetchTelemtMetrics(target);
        if (result.statusCode !== 200 || !result.body.trim()) {
          log.warn(
            { serverId: server.id, status: result.statusCode },
            "traffic poll: metrics unavailable",
          );
          continue;
        }
        const liveByUser = parseLivePerUserTraffic(result.body);
        applyTrafficSnapshot(server.id, liveByUser);
        log.info(
          { serverId: server.id, users: liveByUser.size },
          "traffic poll: snapshot applied",
        );
      } catch (err) {
        log.warn({ err, serverId: server.id }, "traffic poll: server failed");
      }
    }
  } finally {
    polling = false;
  }
}

export function startTrafficPoller(
  log: { info: (o: unknown, msg?: string) => void; warn: (o: unknown, msg?: string) => void },
): void {
  if (pollTimer) return;

  const intervalMs = config.trafficPollIntervalMs;
  log.info({ intervalMs }, "traffic poller started");

  void pollServerTraffic(log);

  pollTimer = setInterval(() => {
    void pollServerTraffic(log);
  }, intervalMs);
}

export function stopTrafficPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
