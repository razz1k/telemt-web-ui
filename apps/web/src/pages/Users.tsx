import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { RemoteServerBanner } from "../components/RemoteServerBanner";
import { ServiceTabs } from "../components/ServiceTabs";
import { useChangeNotify } from "../context/ChangeNotifyContext";
import { useServers } from "../context/ServerContext";
import { isRemoteServer } from "../lib/servers";
import { UserTableRow } from "../components/UserTableRow";
import { api, formatBytes, formatUptime, pickUptimeSeconds } from "../lib/api";
import type { SummaryData, SystemInfoData, UserInfo } from "../lib/types";
import {
  computeMbpsFromCounterDelta,
  formatMbps,
  parsePerUserTrafficMetrics,
  sumPerUserTrafficCounters,
  type UserTrafficMetrics,
} from "../lib/metrics";
import {
  countActiveUniqueIps,
  countUsersOnline,
  exportUsersCsv,
  parseUsersCsv,
  sumUsersTrafficBytes,
  sumUsersTrafficRxTx,
  userSecret,
  userTrafficBytes,
} from "../lib/users";

export function UsersPage() {
  const { activeServer } = useServers();
  const { notifyChange } = useChangeNotify();
  const remote = isRemoteServer(activeServer);
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [newUsername, setNewUsername] = useState("");
  const [publicHost, setPublicHost] = useState("");
  const [publicPort, setPublicPort] = useState("");
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: () => api.getConfig(),
  });

  const trafficCounterRef = useRef<(UserTrafficMetrics & { atMs: number }) | null>(
    null,
  );
  const [bandwidthMbps, setBandwidthMbps] = useState({ down: 0, up: 0 });

  useEffect(() => {
    trafficCounterRef.current = null;
    setBandwidthMbps({ down: 0, up: 0 });
  }, [activeServer.id]);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: async (): Promise<{
      users: UserInfo[];
      system: SystemInfoData | null;
      summary: SummaryData | null;
      trafficCounters: UserTrafficMetrics;
    }> => {
      const [users, activeIps, system, summary, metricsText] =
        await Promise.all([
          api.users(),
          api.activeIps().catch(() => []),
          api.systemInfo().catch(() => null),
          api.summary().catch(() => null),
          api.metricsText().catch(() => ""),
        ]);
      const ipMap = new Map(
        activeIps.map((row) => [row.username, row.ips]),
      );
      const trafficByUser = parsePerUserTrafficMetrics(metricsText);
      const trafficCounters = sumPerUserTrafficCounters(trafficByUser);
      return {
        system,
        summary,
        trafficCounters,
        users: users.map((user) => {
          const traffic = trafficByUser.get(user.username);
          return {
            ...user,
            active_ips: ipMap.get(user.username) ?? user.active_ips ?? [],
            ...(traffic
              ? {
                  rx_bytes: traffic.downloadBytes,
                  tx_bytes: traffic.uploadBytes,
                }
              : {}),
          };
        }),
      };
    },
    refetchInterval: 3000,
  });

  const saveLinksMutation = useMutation({
    mutationFn: async () => {
      if (!configQuery.data?.editable || remote) return;
      const port =
        publicPort.trim() === ""
          ? null
          : Number.parseInt(publicPort, 10) || null;
      return api.putConfig({
        general: {
          links: {
            public_host: publicHost.trim(),
            public_port: port,
          },
        },
      });
    },
    onMutate: () => {
      const links = configQuery.data?.general.links;
      if (!links) return;
      return {
        previous: {
          public_host: links.public_host,
          public_port: links.public_port,
        },
      };
    },
    onSuccess: (_data, _vars, context) => {
      if (context?.previous) {
        const previous = context.previous;
        notifyChange({
          message: "Proxy links updated",
          undo: async () => {
            await api.putConfig({
              general: { links: previous },
            });
            setPublicHost(previous.public_host);
            setPublicPort(
              previous.public_port != null ? String(previous.public_port) : "",
            );
            void queryClient.invalidateQueries({ queryKey: ["config"] });
          },
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.createUser({ username: newUsername.trim() }),
    onMutate: () => ({ username: newUsername.trim() }),
    onSuccess: (_data, _vars, context) => {
      const name = context?.username;
      if (!name) return;
      setNewUsername("");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      notifyChange({
        message: `User "${name}" created`,
        undo: async () => {
          await api.deleteUser(name);
          void queryClient.invalidateQueries({ queryKey: ["users"] });
        },
      });
    },
  });

  useEffect(() => {
    if (!configQuery.data) return;
    setPublicHost(configQuery.data.general.links.public_host);
    setPublicPort(
      configQuery.data.general.links.public_port != null
        ? String(configQuery.data.general.links.public_port)
        : "",
    );
  }, [configQuery.data]);

  const users = usersQuery.data?.users ?? [];
  const totalUsers = users.length;
  const onlineUsers = countUsersOnline(users);
  const activeUniqueIps = countActiveUniqueIps(users);
  const totalTrafficBytes = sumUsersTrafficBytes(users);
  const trafficTotals = sumUsersTrafficRxTx(users);

  useEffect(() => {
    const counters = usersQuery.data?.trafficCounters;
    if (!counters) return;
    const nowMs = Date.now();
    const { downMbps, upMbps } = computeMbpsFromCounterDelta(
      trafficCounterRef.current,
      counters,
      nowMs,
    );
    trafficCounterRef.current = { ...counters, atMs: nowMs };
    setBandwidthMbps({ down: downMbps, up: upMbps });
  }, [usersQuery.dataUpdatedAt, usersQuery.data?.trafficCounters]);

  function undoPatchForUser(
    user: UserInfo,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const undo: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (key === "secret") {
        undo.secret = userSecret(user) ?? user.secret ?? "";
      } else if (key === "max_tcp_conns") {
        undo.max_tcp_conns = user.max_tcp_conns ?? null;
      } else if (key === "max_unique_ips") {
        undo.max_unique_ips = user.max_unique_ips ?? null;
      } else if (key === "data_quota_bytes") {
        undo.data_quota_bytes = user.data_quota_bytes ?? null;
      } else if (key === "expiration_rfc3339") {
        undo.expiration_rfc3339 = user.expiration_rfc3339 ?? null;
      }
    }
    return undo;
  }

  async function handlePatch(username: string, body: Record<string, unknown>) {
    const user = users.find((u) => u.username === username);
    if (!user) return;
    const undoBody = undoPatchForUser(user, body);
    setBusyUser(username);
    try {
      await api.patchUser(username, body);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      notifyChange({
        message: `User "${username}" updated`,
        undo: async () => {
          await api.patchUser(username, undoBody);
          void queryClient.invalidateQueries({ queryKey: ["users"] });
        },
      });
    } finally {
      setBusyUser(null);
    }
  }

  async function handleRotate(username: string) {
    const user = users.find((u) => u.username === username);
    const previousSecret = user ? userSecret(user) : undefined;
    setBusyUser(username);
    try {
      const data = await api.rotateSecret(username);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      if (previousSecret) {
        notifyChange({
          message: `Secret rotated for "${username}"`,
          undo: async () => {
            await api.patchUser(username, { secret: previousSecret });
            void queryClient.invalidateQueries({ queryKey: ["users"] });
          },
        });
      } else {
        notifyChange({ message: `Secret rotated for "${username}"` });
      }
      return data.secret;
    } finally {
      setBusyUser(null);
    }
  }

  function downloadCsv(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <ServiceTabs />

      <RemoteServerBanner />

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 min-w-[200px]">
          <span className="text-gray-500">External IP / DynDNS</span>
          <div className="flex gap-2">
            <input
              className="ui-input flex-1"
              value={publicHost}
              placeholder="hostname or IP"
              disabled={!configQuery.data?.editable || remote}
              onChange={(e) => setPublicHost(e.target.value)}
              onBlur={() => {
                if (configQuery.data?.editable && !remote) saveLinksMutation.mutate();
              }}
            />
            <button
              type="button"
              className="ui-btn ui-btn-blue shrink-0"
              onClick={async () => {
                try {
                  const { ip } = await api.publicIp();
                  if (ip) {
                    setPublicHost(ip);
                    if (configQuery.data?.editable) {
                      const previous = {
                        public_host: configQuery.data.general.links.public_host,
                        public_port: configQuery.data.general.links.public_port,
                      };
                      await api.putConfig({
                        general: {
                          links: {
                            public_host: ip,
                            public_port:
                              publicPort.trim() === ""
                                ? null
                                : Number.parseInt(publicPort, 10) || null,
                          },
                        },
                      });
                      void queryClient.invalidateQueries({ queryKey: ["config"] });
                      notifyChange({
                        message: "Public host updated",
                        undo: async () => {
                          await api.putConfig({
                            general: { links: previous },
                          });
                          setPublicHost(previous.public_host);
                          void queryClient.invalidateQueries({
                            queryKey: ["config"],
                          });
                        },
                      });
                    }
                  }
                } catch {
                  /* ignore */
                }
              }}
            >
              Get IP
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1 w-28">
          <span className="text-gray-500">Public port</span>
          <input
            className="ui-input"
            value={publicPort}
            placeholder="443"
            disabled={!configQuery.data?.editable || remote}
            onChange={(e) => setPublicPort(e.target.value)}
            onBlur={() => {
              if (configQuery.data?.editable && !remote) saveLinksMutation.mutate();
            }}
          />
        </label>
      </div>

      <div
        className="ui-stats-bar"
        role="status"
        aria-live="polite"
        aria-label="Server statistics"
      >
        <div className="ui-stat">
          <span className="ui-stat-label">Uptime</span>
          <span className="ui-stat-value">
            {formatUptime(
              pickUptimeSeconds(usersQuery.data?.system, usersQuery.data?.summary),
            )}
          </span>
        </div>

        <div className="ui-stat">
          <span className="ui-stat-label">Total traffic</span>
          <span className="ui-stat-value ui-stat-directions">
            {trafficTotals.hasSplit ? (
              <>
                <span className="ui-stat-direction">
                  <span className="ui-stat-direction-mark" aria-hidden>
                    ↓
                  </span>
                  <span>{formatBytes(trafficTotals.rx)}</span>
                </span>
                <span className="ui-stat-direction">
                  <span className="ui-stat-direction-mark" aria-hidden>
                    ↑
                  </span>
                  <span>{formatBytes(trafficTotals.tx)}</span>
                </span>
              </>
            ) : (
              <span>{formatBytes(totalTrafficBytes)}</span>
            )}
          </span>
        </div>

        <div className="ui-stat">
          <span className="ui-stat-label">Bandwidth</span>
          <span className="ui-stat-value ui-stat-directions">
            <span className="ui-stat-direction">
              <span className="ui-stat-direction-mark" aria-hidden>
                ↓
              </span>
              <span>{formatMbps(bandwidthMbps.down)}</span>
            </span>
            <span className="ui-stat-direction">
              <span className="ui-stat-direction-mark" aria-hidden>
                ↑
              </span>
              <span>{formatMbps(bandwidthMbps.up)}</span>
            </span>
            <span className="ui-stat-unit">Mbps</span>
          </span>
        </div>

        <div className="ui-stat">
          <span className="ui-stat-label">Connections</span>
          <span className="ui-stat-value">
            {usersQuery.data?.summary?.connections_total ?? "—"}
          </span>
        </div>

        <div className="ui-stat">
          <span className="ui-stat-label">Online</span>
          <span
            className="ui-stat-value"
            title="Users with active connections / total users (active unique IPs)"
          >
            {onlineUsers} / {totalUsers}
            <span className="ui-stat-meta"> ({activeUniqueIps} IP)</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="ui-btn ui-btn-red"
          onClick={async () => {
            if (!confirm("Reset quota counters for all users?")) return;
            for (const u of users) {
              await api.resetQuota(u.username).catch(() => undefined);
            }
            void queryClient.invalidateQueries({ queryKey: ["users"] });
            notifyChange({ message: "Stats reset for all users" });
          }}
        >
          Reset Stats
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-blue"
          onClick={() => {
            const lines = users.map(
              (u) =>
                `${u.username},${formatTraffic(u)},${u.current_connections ?? 0}`,
            );
            downloadCsv(
              "telemt-stats.csv",
              "username,traffic_bytes,connections\n" + lines.join("\n"),
            );
          }}
        >
          Export Stats
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-blue"
          onClick={() => downloadCsv("telemt-users.csv", exportUsersCsv(users))}
        >
          Export Users
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-blue"
          onClick={() => importRef.current?.click()}
        >
          Import Users
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            const rows = parseUsersCsv(text);
            let imported = 0;
            for (const row of rows) {
              try {
                await api.createUser(row);
                imported += 1;
              } catch {
                /* skip row */
              }
            }
            void queryClient.invalidateQueries({ queryKey: ["users"] });
            e.target.value = "";
            if (imported > 0) {
              notifyChange({
                message: `Imported ${imported} user${imported === 1 ? "" : "s"}`,
              });
            }
          }}
        />
      </div>

      <div className="overflow-x-auto rounded border border-surface-border bg-surface-raised/50">
        <table className="ui-table w-full text-sm min-w-[1150px]">
          <thead>
            <tr className="text-left text-gray-500 border-b border-surface-border">
              <th className="py-2 pr-2 font-normal">Name</th>
              <th className="py-2 pr-2 font-normal">Secret (32 hex)</th>
              <th className="py-2 pr-2 font-normal">TCP Conns</th>
              <th className="py-2 pr-2 font-normal">Max IPs</th>
              <th className="py-2 pr-2 font-normal">Quota (GB)</th>
              <th className="py-2 pr-2 font-normal">Expire Date</th>
              <th className="py-2 pr-2 font-normal">Status and Stats</th>
              <th className="py-2 pr-2 font-normal">Ready-to-use link</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserTableRow
                key={user.username}
                user={user}
                busy={busyUser === user.username}
                onPatch={handlePatch}
                onRotate={handleRotate}
                onDelete={async (username) => {
                  const user = users.find((u) => u.username === username);
                  if (!user) return;
                  const snapshot = {
                    username: user.username,
                    secret: userSecret(user),
                    max_tcp_conns: user.max_tcp_conns,
                    max_unique_ips: user.max_unique_ips,
                    data_quota_bytes: user.data_quota_bytes,
                    expiration_rfc3339: user.expiration_rfc3339,
                  };
                  setBusyUser(username);
                  try {
                    await api.deleteUser(username);
                    await queryClient.invalidateQueries({ queryKey: ["users"] });
                    notifyChange({
                      message: `User "${username}" deleted`,
                      undo: async () => {
                        await api.createUser(snapshot);
                        void queryClient.invalidateQueries({ queryKey: ["users"] });
                      },
                    });
                  } finally {
                    setBusyUser(null);
                  }
                }}
                onResetQuota={async (username) => {
                  await api.resetQuota(username);
                  void queryClient.invalidateQueries({ queryKey: ["users"] });
                  notifyChange({
                    message: `Stats reset for "${username}"`,
                  });
                }}
              />
            ))}
            <tr className="border-t border-surface-border">
              <td className="py-3 pr-2">
                <input
                  className="ui-input w-full"
                  placeholder="new_user"
                  value={newUsername}
                  pattern="[A-Za-z0-9_.-]+"
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </td>
              <td colSpan={7} className="py-3">
                <button
                  type="button"
                  className="ui-btn ui-btn-blue"
                  disabled={!newUsername.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  Add user
                </button>
                {createMutation.error ? (
                  <span className="text-red-400 text-xs ml-3">
                    {(createMutation.error as Error).message}
                  </span>
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {usersQuery.error ? (
        <p className="text-sm text-red-400">
          {(usersQuery.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}

function formatTraffic(u: UserInfo): string {
  return String(userTrafficBytes(u));
}
