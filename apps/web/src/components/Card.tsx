import type { ReactNode } from "react";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-surface-border bg-surface-raised p-4 ${className}`}
    >
      {title ? (
        <h2 className="text-sm font-medium text-gray-300 mb-3">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md bg-surface border border-surface-border p-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
      {sub ? <p className="text-xs text-gray-500 mt-0.5">{sub}</p> : null}
    </div>
  );
}
