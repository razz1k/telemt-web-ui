import type {
  ApiEnvelope,
  ConnectionsSummaryData,
  HealthData,
  HealthReadyData,
  MinimalAllData,
  MvpConfig,
  MvpConfigUpdate,
  SummaryData,
  SystemInfoData,
  UserActiveIps,
  UserInfo,
} from "./types";
import type { TelemtServer } from "./servers";

let serverHeadersProvider: () => Record<string, string> = () => ({});

export function setServerHeadersProvider(fn: () => Record<string, string>): void {
  serverHeadersProvider = fn;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const hasBody =
    init?.body !== undefined && init?.body !== null && init?.body !== "";
  const headers: Record<string, string> = {
    ...serverHeadersProvider(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json()) as ApiEnvelope<T> | T;
    if (typeof body === "object" && body !== null && "ok" in body) {
      const envelope = body as ApiEnvelope<T>;
      if (!envelope.ok) {
        throw new Error(envelope.error?.message ?? "Request failed");
      }
      return envelope.data as T;
    }
    return body as T;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.text()) as T;
}

export const api = {
  health: () => request<HealthData>("/api/v1/health"),
  healthReady: async () => {
    const response = await fetch("/api/v1/health/ready");
    const body = (await response.json()) as ApiEnvelope<HealthReadyData>;
    if (body.ok && body.data) return body.data;
    return { ready: false } as HealthReadyData;
  },
  systemInfo: () => request<SystemInfoData>("/api/v1/system/info"),
  summary: () => request<SummaryData>("/api/v1/stats/summary"),
  connectionsSummary: () =>
    request<ConnectionsSummaryData>("/api/v1/runtime/connections/summary"),
  minimalAll: () => request<MinimalAllData>("/api/v1/stats/minimal/all"),
  users: () => request<UserInfo[]>("/api/v1/users"),
  activeIps: () => request<UserActiveIps[]>("/api/v1/stats/users/active-ips"),
  publicIp: () => request<{ ip: string }>("/api/tools/public-ip"),
  createUser: (body: {
    username: string;
    secret?: string;
    data_quota_bytes?: number | null;
    max_tcp_conns?: number | null;
    max_unique_ips?: number | null;
    expiration_rfc3339?: string | null;
  }) =>
    request<UserInfo & { secret?: string }>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchUser: (
    username: string,
    body: Record<string, unknown>,
  ) =>
    request<UserInfo>(`/api/v1/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteUser: (username: string) =>
    request<{ username: string }>(`/api/v1/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
    }),
  rotateSecret: (username: string) =>
    request<{ username: string; secret: string }>(
      `/api/v1/users/${encodeURIComponent(username)}/rotate-secret`,
      { method: "POST", body: "{}" },
    ),
  resetQuota: (username: string) =>
    request<{ username: string }>(
      `/api/v1/users/${encodeURIComponent(username)}/reset-quota`,
      { method: "POST", body: "{}" },
    ),
  resetAccumulatedTraffic: (username?: string) => {
    const query = username
      ? `?username=${encodeURIComponent(username)}`
      : "";
    return request<{ serverId: string; rowsCleared: number }>(
      `/api/traffic/accumulated${query}`,
      { method: "DELETE" },
    );
  },
  getServers: () =>
    request<{ servers: TelemtServer[]; activeServerId: string }>("/api/servers"),
  createServer: (body: {
    name: string;
    apiUrl: string;
    metricsUrl: string;
    auth: string;
  }) => request<TelemtServer>("/api/servers", { method: "POST", body: JSON.stringify(body) }),
  updateServer: (id: string, body: Partial<TelemtServer>) =>
    request<TelemtServer>(`/api/servers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteServer: (id: string) =>
    request<{ id: string }>(`/api/servers/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  setActiveServer: (id: string) =>
    request<{ activeServerId: string }>("/api/servers/active", {
      method: "PUT",
      body: JSON.stringify({ id }),
    }),
  getConfig: () => request<MvpConfig>("/api/config"),
  putConfig: (body: MvpConfigUpdate) =>
    request<MvpConfig>("/api/config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  metricsText: async (): Promise<string> => {
    const response = await fetch("/api/metrics", {
      headers: serverHeadersProvider(),
    });
    if (!response.ok) throw new Error(`Metrics HTTP ${response.status}`);
    return response.text();
  },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

export function pickUptimeSeconds(
  system?: SystemInfoData | null,
  summary?: SummaryData | null,
): number | undefined {
  return (
    system?.uptime_seconds ??
    system?.uptime_secs ??
    summary?.uptime_seconds
  );
}

export function formatUptime(secs?: number): string {
  if (secs === undefined) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
