import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setServerHeadersProvider } from "../lib/api";
import { api } from "../lib/api";
import { useChangeNotify } from "./ChangeNotifyContext";
import {
  initialServersState,
  writeCachedServersState,
} from "../lib/server-storage";
import { BUILTIN_SERVER_ID, serverRequestHeaders, type TelemtServer } from "../lib/servers";

interface ServerContextValue {
  servers: TelemtServer[];
  activeServer: TelemtServer;
  loading: boolean;
  setActiveServerId: (id: string) => void;
  addServer: (server: Omit<TelemtServer, "id" | "builtin">) => Promise<void>;
  updateServer: (id: string, patch: Partial<TelemtServer>) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  globalSettingsOpen: boolean;
  setGlobalSettingsOpen: (open: boolean) => void;
  refreshServers: () => Promise<void>;
}

const ServerContext = createContext<ServerContextValue | null>(null);

const initial = initialServersState();
const fallbackBuiltin: TelemtServer =
  initial.servers.find((s) => s.id === BUILTIN_SERVER_ID) ??
  initial.servers[0] ?? {
    id: BUILTIN_SERVER_ID,
    name: "Default",
    apiUrl: "",
    metricsUrl: "",
    auth: "",
    builtin: true,
  };

function persistServersState(servers: TelemtServer[], activeServerId: string) {
  writeCachedServersState(servers, activeServerId);
}

export function ServerProvider({ children }: { children: ReactNode }) {
  const { notifyChange } = useChangeNotify();
  const [servers, setServers] = useState<TelemtServer[]>(initial.servers);
  const [activeId, setActiveId] = useState(initial.activeId);
  const [loading, setLoading] = useState(true);
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);

  const refreshServers = useCallback(async () => {
    const data = await api.getServers();
    const nextServers =
      data.servers.length > 0 ? data.servers : [fallbackBuiltin];
    setServers(nextServers);
    setActiveId(data.activeServerId);
    persistServersState(nextServers, data.activeServerId);
  }, []);

  useEffect(() => {
    void refreshServers()
      .catch(() => {
        setServers([fallbackBuiltin]);
        setActiveId(BUILTIN_SERVER_ID);
      })
      .finally(() => setLoading(false));
  }, [refreshServers]);

  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeId) ?? servers[0] ?? fallbackBuiltin,
    [servers, activeId],
  );

  useLayoutEffect(() => {
    setServerHeadersProvider(() => serverRequestHeaders(activeServer));
  }, [activeServer]);

  const setActiveServerId = useCallback(
    async (id: string) => {
      if (!servers.some((s) => s.id === id)) return;
      setActiveId(id);
      persistServersState(servers, id);
      await api.setActiveServer(id);
    },
    [servers],
  );

  const addServer = useCallback(
    async (server: Omit<TelemtServer, "id" | "builtin">) => {
      const created = await api.createServer(server);
      await refreshServers();
      setActiveId(created.id);
      notifyChange({
        message: `Server "${created.name}" added`,
        undo: async () => {
          await api.deleteServer(created.id);
          await refreshServers();
        },
      });
    },
    [notifyChange, refreshServers],
  );

  const updateServer = useCallback(
    async (id: string, patch: Partial<TelemtServer>) => {
      const prev = servers.find((s) => s.id === id);
      if (!prev) return;
      await api.updateServer(id, patch);
      await refreshServers();
      notifyChange({
        message: `Server "${patch.name ?? prev.name}" updated`,
        undo: async () => {
          await api.updateServer(id, {
            name: prev.name,
            apiUrl: prev.apiUrl,
            metricsUrl: prev.metricsUrl,
            auth: prev.auth,
          });
          await refreshServers();
        },
      });
    },
    [notifyChange, refreshServers, servers],
  );

  const removeServer = useCallback(
    async (id: string) => {
      const prev = servers.find((s) => s.id === id);
      if (!prev || prev.builtin) return;
      await api.deleteServer(id);
      await refreshServers();
      notifyChange({
        message: `Server "${prev.name}" removed`,
        undo: async () => {
          await api.createServer({
            name: prev.name,
            apiUrl: prev.apiUrl,
            metricsUrl: prev.metricsUrl,
            auth: prev.auth,
          });
          await refreshServers();
        },
      });
    },
    [notifyChange, refreshServers, servers],
  );

  const value: ServerContextValue = {
    servers,
    activeServer,
    loading,
    setActiveServerId,
    addServer,
    updateServer,
    removeServer,
    globalSettingsOpen,
    setGlobalSettingsOpen,
    refreshServers,
  };

  return (
    <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
  );
}

export function useServers(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) {
    throw new Error("useServers must be used within ServerProvider");
  }
  return ctx;
}
