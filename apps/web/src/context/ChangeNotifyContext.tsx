import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const AUTO_HIDE_MS = 5000;

export interface ChangeNotification {
  id: number;
  message: string;
  undo?: () => void | Promise<void>;
}

type PanelPhase = "open" | "docked";

interface ChangeNotifyContextValue {
  notifyChange: (options: {
    message: string;
    undo?: () => void | Promise<void>;
  }) => void;
}

const ChangeNotifyContext = createContext<ChangeNotifyContextValue | null>(null);

function ChangeNotifyPanel({
  notification,
  phase,
  onDock,
  onExpand,
  onDismiss,
  onUndo,
  undoing,
}: {
  notification: ChangeNotification;
  phase: PanelPhase;
  onDock: () => void;
  onExpand: () => void;
  onDismiss: () => void;
  onUndo: () => void;
  undoing: boolean;
}) {
  return (
    <div
      className={`change-notify change-notify--${phase}`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="change-notify-tab"
        onClick={phase === "docked" ? onExpand : onDock}
        aria-label={phase === "docked" ? "Show notification" : "Minimize"}
        title={phase === "docked" ? "Show notification" : "Minimize"}
      >
        {phase === "docked" ? "◀" : "▶"}
      </button>
      <div className="change-notify-body">
        <p className="change-notify-message">{notification.message}</p>
        <div className="change-notify-actions">
          {notification.undo ? (
            <button
              type="button"
              className="ui-btn ui-btn-ghost text-xs"
              disabled={undoing}
              onClick={() => void onUndo()}
            >
              {undoing ? "Undoing…" : "Undo"}
            </button>
          ) : null}
          <button
            type="button"
            className="ui-btn ui-btn-ghost text-xs"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChangeNotifyProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<ChangeNotification | null>(
    null,
  );
  const [phase, setPhase] = useState<PanelPhase>("open");
  const [undoing, setUndoing] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextIdRef = useRef(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleDock = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setPhase("docked");
      hideTimerRef.current = null;
    }, AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const notifyChange = useCallback(
    (options: { message: string; undo?: () => void | Promise<void> }) => {
      nextIdRef.current += 1;
      setNotification({
        id: nextIdRef.current,
        message: options.message,
        undo: options.undo,
      });
      setPhase("open");
      setUndoing(false);
      scheduleDock();
    },
    [scheduleDock],
  );

  const dismiss = useCallback(() => {
    clearHideTimer();
    setNotification(null);
    setPhase("open");
    setUndoing(false);
  }, [clearHideTimer]);

  const dockNow = useCallback(() => {
    clearHideTimer();
    setPhase("docked");
  }, [clearHideTimer]);

  const expand = useCallback(() => {
    setPhase("open");
    scheduleDock();
  }, [scheduleDock]);

  const runUndo = useCallback(async () => {
    if (!notification?.undo) return;
    setUndoing(true);
    try {
      await notification.undo();
      dismiss();
    } catch {
      setUndoing(false);
    }
  }, [notification, dismiss]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return (
    <ChangeNotifyContext.Provider value={{ notifyChange }}>
      {children}
      {notification ? (
        <ChangeNotifyPanel
          notification={notification}
          phase={phase}
          onDock={dockNow}
          onExpand={expand}
          onDismiss={dismiss}
          onUndo={runUndo}
          undoing={undoing}
        />
      ) : null}
    </ChangeNotifyContext.Provider>
  );
}

export function useChangeNotify(): ChangeNotifyContextValue {
  const ctx = useContext(ChangeNotifyContext);
  if (!ctx) {
    throw new Error("useChangeNotify must be used within ChangeNotifyProvider");
  }
  return ctx;
}
