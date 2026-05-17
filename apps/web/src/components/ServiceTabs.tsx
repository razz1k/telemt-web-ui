import { NavLink } from "react-router-dom";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
    isActive
      ? "border-accent text-gray-100 font-medium"
      : "border-transparent text-gray-500 hover:text-gray-300"
  }`;

const disabledClass =
  "px-4 py-2 text-sm border-b-2 border-transparent text-gray-600 cursor-not-allowed whitespace-nowrap";

export function ServiceTabs() {
  return (
    <nav className="flex flex-wrap gap-0 border-b border-surface-border mb-4 -mx-1">
      <NavLink to="/settings" className={tabClass}>
        General Settings
      </NavLink>
      <span className={disabledClass} title="Coming soon">
        Advanced Tuning
      </span>
      <span className={disabledClass} title="Coming soon">
        Upstreams
      </span>
      <NavLink to="/users" className={tabClass}>
        Users
      </NavLink>
      <span className={disabledClass} title="Not available in standalone UI">
        Telegram Bot
      </span>
      <NavLink to="/" end className={tabClass}>
        Diagnostics
      </NavLink>
    </nav>
  );
}
