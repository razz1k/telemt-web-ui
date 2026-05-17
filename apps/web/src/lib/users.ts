import type { UserInfo } from "./types";

const SECRET_HEX32 = /^[0-9a-f]{32}$/i;

export function pickProxyLink(user: UserInfo): string {
  const tls = user.links?.tls?.[0];
  if (tls) return tls;
  const secure = user.links?.secure?.[0];
  if (secure) return secure;
  const classic = user.links?.classic?.[0];
  if (classic) return classic;
  return "";
}

/** 32-char hex secret from tg:// or https proxy link (`secret=` query param). */
export function parseSecretFromProxyLink(link: string): string | undefined {
  const trimmed = link.trim();
  if (!trimmed) return undefined;

  let secretRaw: string | null = null;
  try {
    const normalized = trimmed.replace(/^tg:\/\//i, "https://");
    secretRaw = new URL(normalized).searchParams.get("secret");
  } catch {
    const match = trimmed.match(/[?&]secret=([^&#]+)/i);
    secretRaw = match?.[1] ? decodeURIComponent(match[1]) : null;
  }

  if (!secretRaw) return undefined;
  const raw = secretRaw.trim();
  if (SECRET_HEX32.test(raw)) return raw.toLowerCase();
  const prefixed = raw.match(/^[0-9a-f]{2}([0-9a-f]{32})/i);
  if (prefixed) return prefixed[1].toLowerCase();
  return undefined;
}

/** API secret, or parsed from proxy links when the API omits it. */
export function userSecret(user: UserInfo): string | undefined {
  const fromApi = user.secret?.trim();
  if (fromApi && SECRET_HEX32.test(fromApi)) return fromApi.toLowerCase();

  const links = [
    ...(user.links?.tls ?? []),
    ...(user.links?.secure ?? []),
    ...(user.links?.classic ?? []),
  ];
  for (const link of links) {
    const parsed = parseSecretFromProxyLink(link);
    if (parsed) return parsed;
  }
  return undefined;
}

export function formatTrafficMb(bytes?: number): string {
  if (bytes === undefined || bytes === 0) return "0.00 MB";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function userTrafficBytes(user: UserInfo): number {
  return user.total_octets ?? user.data_used_bytes ?? 0;
}

/** Live session: active TCP connections right now. */
export function isUserOnline(user: UserInfo): boolean {
  return (user.current_connections ?? 0) > 0;
}

export function userDataUsedBytes(user: UserInfo): number {
  return user.data_used_bytes ?? user.total_octets ?? userTrafficBytes(user);
}

export function isUserExpired(
  user: UserInfo,
  nowMs: number = Date.now(),
): boolean {
  if (!user.expiration_rfc3339) return false;
  const expires = Date.parse(user.expiration_rfc3339);
  return Number.isFinite(expires) && expires <= nowMs;
}

export function isUserQuotaExceeded(user: UserInfo): boolean {
  const quota = user.data_quota_bytes;
  if (quota == null || quota <= 0) return false;
  return userDataUsedBytes(user) >= quota;
}

/** Row highlight: expired (red) > quota full (amber) > online (green). */
export function userRowHighlightClass(user: UserInfo): string {
  if (isUserExpired(user)) return "bg-red-500/10";
  if (isUserQuotaExceeded(user)) return "bg-amber-500/10";
  if (isUserOnline(user)) return "bg-emerald-500/10";
  return "";
}

export function userStatusDotClass(user: UserInfo): string {
  if (isUserExpired(user)) return "bg-red-400";
  if (isUserQuotaExceeded(user)) return "bg-amber-400";
  if (isUserOnline(user)) return "bg-emerald-400";
  return "bg-gray-500";
}

export function sumUsersTrafficBytes(users: UserInfo[]): number {
  return users.reduce((sum, u) => sum + userTrafficBytes(u), 0);
}

export function countUsersOnline(users: UserInfo[]): number {
  return users.filter(isUserOnline).length;
}

export function userActiveIpCount(user: UserInfo): number {
  return user.active_unique_ips ?? user.active_ips?.length ?? 0;
}

/** Distinct active source IPs across all users (deduped when lists are present). */
export function countActiveUniqueIps(users: UserInfo[]): number {
  const seen = new Set<string>();
  for (const user of users) {
    const list = user.active_unique_ips_list ?? user.active_ips;
    if (list && list.length > 0) {
      for (const ip of list) {
        if (ip) seen.add(ip);
      }
    }
  }
  if (seen.size > 0) return seen.size;
  return users.reduce((sum, u) => sum + userActiveIpCount(u), 0);
}

export function formatUserTraffic(user: UserInfo): { down: string; up: string } {
  if (user.rx_bytes !== undefined && user.tx_bytes !== undefined) {
    return {
      down: formatTrafficMb(user.rx_bytes),
      up: formatTrafficMb(user.tx_bytes),
    };
  }
  const total = userTrafficBytes(user);
  return {
    down: formatTrafficMb(total),
    up: "—",
  };
}

export function sumUsersTrafficRxTx(users: UserInfo[]): {
  rx: number;
  tx: number;
  hasSplit: boolean;
} {
  let rx = 0;
  let tx = 0;
  let hasSplit = false;
  for (const user of users) {
    if (user.rx_bytes !== undefined && user.tx_bytes !== undefined) {
      hasSplit = true;
      rx += user.rx_bytes;
      tx += user.tx_bytes;
    }
  }
  return { rx, tx, hasSplit };
}

export function formatIpBadge(user: UserInfo): string {
  const active = user.active_unique_ips ?? user.active_ips?.length ?? 0;
  const max = user.max_unique_ips;
  if (max != null && max > 0) {
    return `${active}/${max} IP`;
  }
  return `${active} IP`;
}

export function parseQuotaGbInput(value: string): number | null | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "unlimited") return null;
  const num = Number.parseFloat(trimmed);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return Math.round(num * 1024 * 1024 * 1024);
}

export function quotaGbToInput(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  return String(Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100);
}

export function parseLimitInput(value: string): number | null | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "unlimited") return null;
  const num = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return num;
}

export function limitToInput(value: number | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function exportUsersCsv(users: UserInfo[]): string {
  const header = "username,secret,max_tcp_conns,max_unique_ips,quota_gb,expiration";
  const rows = users.map((u) => {
    const quota =
      u.data_quota_bytes != null
        ? String(u.data_quota_bytes / (1024 * 1024 * 1024))
        : "";
    return [
      u.username,
      userSecret(u) ?? "",
      u.max_tcp_conns ?? "",
      u.max_unique_ips ?? "",
      quota,
      u.expiration_rfc3339 ?? "",
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function parseUsersCsv(text: string): Array<{
  username: string;
  secret?: string;
  max_tcp_conns?: number;
  max_unique_ips?: number;
  data_quota_bytes?: number;
}> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const start = lines[0].toLowerCase().startsWith("username") ? 1 : 0;
  const result: Array<{
    username: string;
    secret?: string;
    max_tcp_conns?: number;
    max_unique_ips?: number;
    data_quota_bytes?: number;
  }> = [];

  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    const username = parts[0];
    if (!username || !/^[A-Za-z0-9_.-]+$/.test(username)) continue;
    const secret = parts[1] || undefined;
    const maxTcp = parts[2] ? Number.parseInt(parts[2], 10) : undefined;
    const maxIps = parts[3] ? Number.parseInt(parts[3], 10) : undefined;
    const quotaGb = parts[4] ? Number.parseFloat(parts[4]) : undefined;
    result.push({
      username,
      secret: secret && /^[0-9a-fA-F]{32}$/.test(secret) ? secret : undefined,
      max_tcp_conns: Number.isFinite(maxTcp) ? maxTcp : undefined,
      max_unique_ips: Number.isFinite(maxIps) ? maxIps : undefined,
      data_quota_bytes:
        quotaGb !== undefined && Number.isFinite(quotaGb)
          ? Math.round(quotaGb * 1024 * 1024 * 1024)
          : undefined,
    });
  }
  return result;
}
