import { BUILTIN_SERVER_ID, type TelemtServer } from "./servers";

const ACTIVE_KEY = "telemt-web-ui.activeServerId";
const SERVERS_KEY = "telemt-web-ui.servers";

export interface CachedServersState {
  servers: TelemtServer[];
  activeServerId: string;
}

export function readCachedServersState(): CachedServersState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const activeServerId = localStorage.getItem(ACTIVE_KEY);
    const raw = localStorage.getItem(SERVERS_KEY);
    if (!activeServerId || !raw) return null;
    const servers = JSON.parse(raw) as TelemtServer[];
    if (!Array.isArray(servers) || servers.length === 0) return null;
    if (!servers.some((s) => s.id === activeServerId)) return null;
    return { servers, activeServerId };
  } catch {
    return null;
  }
}

export function writeCachedServersState(
  servers: TelemtServer[],
  activeServerId: string,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_KEY, activeServerId);
    localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
  } catch {
    /* quota / private mode */
  }
}

export function clearCachedServersState(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(SERVERS_KEY);
  } catch {
    /* ignore */
  }
}

export function initialServersState(): {
  servers: TelemtServer[];
  activeId: string;
} {
  const cached = readCachedServersState();
  if (cached) {
    return { servers: cached.servers, activeId: cached.activeServerId };
  }
  return {
    servers: [
      {
        id: BUILTIN_SERVER_ID,
        name: "Default",
        apiUrl: "",
        metricsUrl: "",
        auth: "",
        builtin: true,
      },
    ],
    activeId: BUILTIN_SERVER_ID,
  };
}
