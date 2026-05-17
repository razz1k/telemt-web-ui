import { useServers } from "../context/ServerContext";
import { isRemoteServer } from "../lib/servers";

export function RemoteServerBanner() {
  const { activeServer } = useServers();
  if (!isRemoteServer(activeServer)) return null;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4">
      Remote server <strong className="font-medium">{activeServer.name}</strong> —
      local config.toml editing is unavailable. User management still uses
      telemt API on the selected host.
    </div>
  );
}
