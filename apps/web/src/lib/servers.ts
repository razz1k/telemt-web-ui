export interface TelemtServer {
  id: string;
  name: string;
  apiUrl: string;
  metricsUrl: string;
  auth: string;
  /** Built-in profile; empty URLs use BFF env (see envDefaults) */
  builtin?: boolean;
  envDefaults?: { apiUrl: string; metricsUrl: string };
}

export const BUILTIN_SERVER_ID = "default";

export function serverRequestHeaders(server: TelemtServer): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Telemt-Server-Id": server.id,
  };
  if (server.apiUrl.trim()) {
    headers["X-Telemt-Api-Url"] = server.apiUrl.trim().replace(/\/$/, "");
  }
  if (server.metricsUrl.trim()) {
    headers["X-Telemt-Metrics-Url"] = server.metricsUrl.trim().replace(/\/$/, "");
  }
  if (server.auth.trim()) {
    headers["X-Telemt-Api-Auth"] = server.auth.trim();
  }
  return headers;
}

function normalizeOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * True when local config.toml editing must not be offered (non-builtin, or
 * builtin with a custom API URL that does not match the BFF environment).
 */
export function isRemoteServer(server: TelemtServer): boolean {
  if (!server.builtin) return true;
  const custom = server.apiUrl.trim();
  if (!custom) return false;
  const envDefault = server.envDefaults?.apiUrl?.trim();
  if (!envDefault) return true;
  const a = normalizeOrigin(custom);
  const b = normalizeOrigin(envDefault);
  if (!a || !b) return true;
  return a !== b;
}
