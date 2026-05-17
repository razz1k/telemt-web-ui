import { useServers } from "../context/ServerContext";

export function ServerSelector() {
  const { servers, activeServer, setActiveServerId } = useServers();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 shrink-0">Server</span>
      <select
        className="ui-input min-w-[200px] max-w-[320px]"
        value={activeServer.id}
        onChange={(e) => setActiveServerId(e.target.value)}
      >
        {servers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.name}
            {server.builtin ? " (env)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
