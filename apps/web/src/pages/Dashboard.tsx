import { useQuery } from "@tanstack/react-query";
import { Card, Stat, StatGrid } from "../components/Card";
import { ServiceTabs } from "../components/ServiceTabs";
import { StatusBadge } from "../components/StatusBadge";
import { api, formatBytes, formatUptime, pickUptimeSeconds } from "../lib/api";
import {
  mergePerUserTrafficMetrics,
  parseAccumulatedPerUserTraffic,
  parseDashboardMetrics,
  parsePerUserTrafficMetrics,
  sumPerUserTrafficCounters,
} from "../lib/metrics";
import { useAutoRefresh } from "../context/AutoRefreshContext";
import { countUsersOnline } from "../lib/users";
import type { ServiceState } from "../lib/types";

function deriveServiceState(
  healthOk: boolean,
  ready: boolean | undefined,
): ServiceState {
  if (healthOk && ready) return "RUNNING";
  if (healthOk && ready === false) return "STARTING";
  if (!healthOk) return "STOPPED";
  return "UNKNOWN";
}

export function DashboardPage() {
  const { intervalMs } = useAutoRefresh();
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const results = await Promise.allSettled([
        api.health(),
        api.healthReady().catch(() => ({ ready: false } as { ready: boolean })),
        api.systemInfo(),
        api.summary(),
        api.connectionsSummary(),
        api.minimalAll(),
        api.metricsText(),
        api.users(),
      ]);

      const health =
        results[0].status === "fulfilled" ? results[0].value : null;
      const ready =
        results[1].status === "fulfilled" ? results[1].value : null;
      const system =
        results[2].status === "fulfilled" ? results[2].value : null;
      const summary =
        results[3].status === "fulfilled" ? results[3].value : null;
      const connections =
        results[4].status === "fulfilled" ? results[4].value : null;
      const minimal =
        results[5].status === "fulfilled" ? results[5].value : null;
      const metricsText =
        results[6].status === "fulfilled" ? results[6].value : "";
      const users =
        results[7].status === "fulfilled" ? results[7].value : null;
      const prom = parseDashboardMetrics(metricsText);
      const traffic = sumPerUserTrafficCounters(
        mergePerUserTrafficMetrics(
          parsePerUserTrafficMetrics(metricsText),
          parseAccumulatedPerUserTraffic(metricsText),
        ),
      );

      const healthOk = health?.status === "ok";
      const serviceState = deriveServiceState(healthOk, ready?.ready);

      return {
        healthOk,
        serviceState,
        readOnly: health?.read_only ?? false,
        system,
        summary,
        connections,
        minimal,
        prom,
        traffic,
        users,
        error: !healthOk,
      };
    },
    refetchInterval: intervalMs,
  });

  const data = dashboardQuery.data;
  const loading = dashboardQuery.isLoading;

  if (loading && !data) {
    return <p className="text-gray-500">Loading dashboard…</p>;
  }

  const activeConnections =
    data?.connections?.total_connections ??
    data?.summary?.connections_total ??
    data?.prom.activeConnections;
  const usersOnline =
    data?.users !== null && data?.users !== undefined
      ? countUsersOnline(data.users)
      : data?.prom.usersOnline ?? data?.connections?.unique_ips;

  return (
    <div className="space-y-4">
      <ServiceTabs />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Diagnostics</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Live proxy status and traffic overview
          </p>
        </div>
        {data ? <StatusBadge state={data.serviceState} /> : null}
      </div>

      {data?.error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Cannot reach Telemt API. Check that telemt is running and API whitelist
          allows the BFF container.
        </div>
      ) : null}

      <StatGrid>
        <Stat
          label="Connections"
          value={activeConnections !== undefined ? String(activeConnections) : "—"}
        />
        <Stat
          label="Users online"
          value={usersOnline !== undefined ? String(usersOnline) : "—"}
        />
        <Stat
          label="Uptime"
          value={formatUptime(pickUptimeSeconds(data?.system, data?.summary))}
        />
        <Stat
          label="Config reloads"
          value={String(data?.system?.config_reload_count ?? "—")}
        />
      </StatGrid>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Routing">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">TG path</dt>
              <dd className="font-mono text-accent">
                {data?.minimal?.network_path?.tg_path ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Egress</dt>
              <dd className="font-mono text-accent">
                {data?.minimal?.network_path?.egress ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">API mode</dt>
              <dd>{data?.readOnly ? "Read-only" : "Read-write"}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Traffic">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">RX</dt>
              <dd>{formatBytes(data?.traffic?.downloadBytes ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">TX</dt>
              <dd>{formatBytes(data?.traffic?.uploadBytes ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Version</dt>
              <dd className="font-mono text-xs">{data?.system?.version ?? "—"}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {data?.connections?.top_users && data.connections.top_users.length > 0 ? (
        <Card title="Top users by connections">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-surface-border">
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium">Connections</th>
              </tr>
            </thead>
            <tbody>
              {data.connections.top_users.map((row) => (
                <tr key={row.username} className="border-b border-surface-border/50">
                  <td className="py-2 font-mono">{row.username}</td>
                  <td className="py-2">{row.connections}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
