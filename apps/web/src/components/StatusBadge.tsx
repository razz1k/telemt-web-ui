import type { ServiceState } from "../lib/types";

const styles: Record<ServiceState, string> = {
  RUNNING: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  STARTING: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  STOPPED: "bg-red-500/20 text-red-400 border-red-500/40",
  UNKNOWN: "bg-gray-500/20 text-gray-400 border-gray-500/40",
};

export function StatusBadge({ state }: { state: ServiceState }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[state]}`}
    >
      {state}
    </span>
  );
}
