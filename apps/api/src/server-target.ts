import { config } from "./env.js";
import type { ServerDto } from "./db/servers.js";
import { BUILTIN_SERVER_ID } from "./db/index.js";
import type { ProxyTarget } from "./target.js";

function effectiveUrl(stored: string, envDefault: string): string {
  const trimmed = stored.trim();
  return trimmed || envDefault.replace(/\/$/, "");
}

function isLocalConfigServer(server: ServerDto, apiUrl: string): boolean {
  if (server.id !== BUILTIN_SERVER_ID) return false;
  if (!server.apiUrl.trim()) return true;
  return apiUrl === config.telemtApiUrl.replace(/\/$/, "");
}

export function resolveTargetForServer(server: ServerDto): ProxyTarget {
  const apiUrl = effectiveUrl(
    server.apiUrl,
    server.envDefaults?.apiUrl ?? config.telemtApiUrl,
  );
  const metricsUrl = effectiveUrl(
    server.metricsUrl,
    server.envDefaults?.metricsUrl ?? config.telemtMetricsUrl,
  );
  const apiAuth = server.auth.trim() || config.telemtApiAuth;

  return {
    apiUrl,
    metricsUrl,
    apiAuth,
    isRemote: !isLocalConfigServer(server, apiUrl),
  };
}
