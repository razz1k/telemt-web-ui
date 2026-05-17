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

export function isRemoteServer(server: TelemtServer): boolean {
  return !server.builtin && server.apiUrl.trim().length > 0;
}
