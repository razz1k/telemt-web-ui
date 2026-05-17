export function parsePrometheusMetric(
  text: string,
  name: string,
): number | undefined {
  const regex = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\{[^}]*\\})?\\s+([\\d.eE+-]+)`, "m");
  const match = text.match(regex);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export interface ParsedMetrics {
  activeConnections?: number;
  usersOnline?: number;
}

export function parseDashboardMetrics(text: string): ParsedMetrics {
  return {
    activeConnections:
      parsePrometheusMetric(text, "telemt_active_connections") ??
      parsePrometheusMetric(text, "telemt_connections_active"),
    usersOnline:
      parsePrometheusMetric(text, "telemt_users_online") ??
      parsePrometheusMetric(text, "telemt_online_users"),
  };
}

/** Per-user download/upload from Prometheus (see Telemt zabbix template). */
export interface UserTrafficMetrics {
  downloadBytes: number;
  uploadBytes: number;
}

function escapeMetricName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parses `metric{label="value"} 123` lines; label value is capture group 1. */
export function parsePrometheusLabeledMetric(
  text: string,
  metricName: string,
  labelName: string,
): Map<string, number> {
  const out = new Map<string, number>();
  const regex = new RegExp(
    `^${escapeMetricName(metricName)}\\{${escapeMetricName(labelName)}="([^"]+)"\\}\\s+([\\d.eE+-]+)`,
    "gm",
  );
  for (const match of text.matchAll(regex)) {
    const label = match[1];
    const value = Number.parseFloat(match[2]);
    if (label && Number.isFinite(value)) {
      out.set(label, value);
    }
  }
  return out;
}

export function sumPerUserTrafficCounters(
  trafficByUser: Map<string, UserTrafficMetrics>,
): UserTrafficMetrics {
  let downloadBytes = 0;
  let uploadBytes = 0;
  for (const row of trafficByUser.values()) {
    downloadBytes += row.downloadBytes;
    uploadBytes += row.uploadBytes;
  }
  return { downloadBytes, uploadBytes };
}

export function computeMbpsFromCounterDelta(
  previous: UserTrafficMetrics & { atMs: number } | null,
  current: UserTrafficMetrics,
  nowMs: number = Date.now(),
): { downMbps: number; upMbps: number } {
  if (!previous) {
    return { downMbps: 0, upMbps: 0 };
  }
  const seconds = (nowMs - previous.atMs) / 1000;
  if (seconds <= 0) {
    return { downMbps: 0, upMbps: 0 };
  }
  const downMbps =
    (Math.max(0, current.downloadBytes - previous.downloadBytes) * 8) /
    seconds /
    1_000_000;
  const upMbps =
    (Math.max(0, current.uploadBytes - previous.uploadBytes) * 8) /
    seconds /
    1_000_000;
  return { downMbps, upMbps };
}

export function formatMbps(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export function parsePerUserTrafficMetrics(
  text: string,
): Map<string, UserTrafficMetrics> {
  const upload = parsePrometheusLabeledMetric(
    text,
    "telemt_user_octets_from_client",
    "user",
  );
  const download = parsePrometheusLabeledMetric(
    text,
    "telemt_user_octets_to_client",
    "user",
  );
  const users = new Set([...upload.keys(), ...download.keys()]);
  const map = new Map<string, UserTrafficMetrics>();
  for (const username of users) {
    map.set(username, {
      downloadBytes: download.get(username) ?? 0,
      uploadBytes: upload.get(username) ?? 0,
    });
  }
  return map;
}

/** Persisted totals from BFF SQLite (LuCI-compatible metric names). */
export function parseAccumulatedPerUserTraffic(
  text: string,
): Map<string, UserTrafficMetrics> {
  const download = parsePrometheusLabeledMetric(
    text,
    "telemt_accumulated_tx",
    "user",
  );
  const upload = parsePrometheusLabeledMetric(
    text,
    "telemt_accumulated_rx",
    "user",
  );
  const users = new Set([...download.keys(), ...upload.keys()]);
  const map = new Map<string, UserTrafficMetrics>();
  for (const username of users) {
    map.set(username, {
      downloadBytes: download.get(username) ?? 0,
      uploadBytes: upload.get(username) ?? 0,
    });
  }
  return map;
}

export function mergePerUserTrafficMetrics(
  live: Map<string, UserTrafficMetrics>,
  accumulated: Map<string, UserTrafficMetrics>,
): Map<string, UserTrafficMetrics> {
  const users = new Set([...live.keys(), ...accumulated.keys()]);
  const map = new Map<string, UserTrafficMetrics>();
  for (const username of users) {
    const l = live.get(username);
    const a = accumulated.get(username);
    map.set(username, {
      downloadBytes: (l?.downloadBytes ?? 0) + (a?.downloadBytes ?? 0),
      uploadBytes: (l?.uploadBytes ?? 0) + (a?.uploadBytes ?? 0),
    });
  }
  return map;
}
