import { useAutoRefresh } from "../context/AutoRefreshContext";

export function AutoRefreshToggle() {
  const { enabled, setEnabled } = useAutoRefresh();

  return (
    <div
      className="flex items-center gap-2 text-sm text-gray-400 select-none"
      title="Auto-refresh Diagnostics and Users every 3 seconds"
    >
      <span className="hidden sm:inline">Live updates</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Live updates"
        className={`relative inline-flex h-6 w-10 shrink-0 rounded-full border transition-colors ${
          enabled
            ? "bg-sky-900/60 border-sky-600/80"
            : "bg-surface border-surface-border"
        }`}
        onClick={() => setEnabled(!enabled)}
      >
        <span
          className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-gray-200 shadow transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
