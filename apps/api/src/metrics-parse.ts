/** Per-user download/upload from Prometheus (aligned with Telemt / LuCI). */
export interface UserTrafficSnapshot {
  downloadBytes: number;
  uploadBytes: number;
}

function escapeMetricName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

/** Live counters since Telemt process start. */
export function parseLivePerUserTraffic(
  text: string,
): Map<string, UserTrafficSnapshot> {
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
  const map = new Map<string, UserTrafficSnapshot>();
  for (const username of users) {
    map.set(username, {
      downloadBytes: download.get(username) ?? 0,
      uploadBytes: upload.get(username) ?? 0,
    });
  }
  return map;
}

/**
 * Persisted totals (telemt-web-ui SQLite), exposed like LuCI accumulated_*.
 * download = telemt_accumulated_tx, upload = telemt_accumulated_rx
 */
export function parseAccumulatedPerUserTraffic(
  text: string,
): Map<string, UserTrafficSnapshot> {
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
  const map = new Map<string, UserTrafficSnapshot>();
  for (const username of users) {
    map.set(username, {
      downloadBytes: download.get(username) ?? 0,
      uploadBytes: upload.get(username) ?? 0,
    });
  }
  return map;
}

export function mergeTrafficMaps(
  live: Map<string, UserTrafficSnapshot>,
  accumulated: Map<string, UserTrafficSnapshot>,
): Map<string, UserTrafficSnapshot> {
  const users = new Set([...live.keys(), ...accumulated.keys()]);
  const map = new Map<string, UserTrafficSnapshot>();
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
