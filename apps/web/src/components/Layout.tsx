import { Outlet } from "react-router-dom";
import { useServers } from "../context/ServerContext";
import { AutoRefreshToggle } from "./AutoRefreshToggle";
import { GlobalSettingsModal } from "./GlobalSettingsModal";
import { ServerSelector } from "./ServerSelector";

export function Layout() {
  const { setGlobalSettingsOpen } = useServers();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-surface-border bg-surface-raised/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Telemt</h1>
            <p className="text-xs text-gray-500">MTProxy control panel</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <AutoRefreshToggle />
            <ServerSelector />
            <button
              type="button"
              className="ui-btn ui-btn-ghost flex items-center gap-1.5"
              onClick={() => setGlobalSettingsOpen(true)}
              title="Global settings — telemt servers"
            >
              <span aria-hidden>⚙</span>
              <span>Servers</span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
      <GlobalSettingsModal />
    </div>
  );
}
