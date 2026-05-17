import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export const AUTO_REFRESH_MS = 3000;

const STORAGE_KEY = "telemt-web-ui.autoRefresh";

function readStored(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw !== "0" && raw !== "false";
  } catch {
    return true;
  }
}

function writeStored(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface AutoRefreshContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  intervalMs: number | false;
}

const AutoRefreshContext = createContext<AutoRefreshContextValue | null>(null);

export function AutoRefreshProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readStored);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    writeStored(value);
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      writeStored(next);
      return next;
    });
  }, []);

  const value: AutoRefreshContextValue = {
    enabled,
    setEnabled,
    toggle,
    intervalMs: enabled ? AUTO_REFRESH_MS : false,
  };

  return (
    <AutoRefreshContext.Provider value={value}>
      {children}
    </AutoRefreshContext.Provider>
  );
}

export function useAutoRefresh(): AutoRefreshContextValue {
  const ctx = useContext(AutoRefreshContext);
  if (!ctx) {
    throw new Error("useAutoRefresh must be used within AutoRefreshProvider");
  }
  return ctx;
}
