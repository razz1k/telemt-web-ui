import { useState } from "react";
import { useServers } from "../context/ServerContext";
import type { TelemtServer } from "../lib/servers";

const emptyForm = {
  name: "",
  apiUrl: "http://host.docker.internal:9091",
  metricsUrl: "http://host.docker.internal:9092",
  auth: "",
};

export function GlobalSettingsModal() {
  const {
    servers,
    activeServer,
    globalSettingsOpen,
    setGlobalSettingsOpen,
    addServer,
    updateServer,
    removeServer,
  } = useServers();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  if (!globalSettingsOpen) return null;

  const editingServer =
    editingId && editingId !== "new"
      ? servers.find((s) => s.id === editingId)
      : null;
  const editingBuiltin = editingServer?.builtin ?? false;

  function startAdd() {
    setEditingId("new");
    setForm(emptyForm);
    setTestStatus(null);
  }

  function startEdit(server: TelemtServer) {
    setEditingId(server.id);
    setForm({
      name: server.name,
      apiUrl: server.apiUrl,
      metricsUrl: server.metricsUrl,
      auth: server.auth,
    });
    setTestStatus(null);
  }

  function effectiveUrl(
    stored: string,
    envDefault: string | undefined,
  ): string {
    return stored.trim() || envDefault?.trim() || "";
  }

  async function testConnection() {
    setTesting(true);
    setTestStatus(null);
    try {
      const headers: Record<string, string> = {};
      if (form.apiUrl.trim()) {
        headers["X-Telemt-Api-Url"] = form.apiUrl.trim().replace(/\/$/, "");
      }
      if (form.auth.trim()) {
        headers["X-Telemt-Api-Auth"] = form.auth.trim();
      }
      const response = await fetch("/api/v1/health", { headers });
      const body = await response.json();
      if (body.ok) {
        setTestStatus("Connection OK");
      } else {
        setTestStatus(body.error?.message ?? "Connection failed");
      }
    } catch (err) {
      setTestStatus((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function saveForm() {
    if (!form.name.trim()) return;
    try {
      if (editingId === "new") {
        await addServer({
          name: form.name.trim(),
          apiUrl: form.apiUrl.trim(),
          metricsUrl: form.metricsUrl.trim(),
          auth: form.auth.trim(),
        });
      } else if (editingId) {
        await updateServer(editingId, {
          name: form.name.trim(),
          apiUrl: form.apiUrl.trim(),
          metricsUrl: form.metricsUrl.trim(),
          auth: form.auth.trim(),
        });
      }
      setEditingId(null);
      setForm(emptyForm);
      setTestStatus(null);
    } catch {
      setTestStatus("Failed to save server");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={() => setGlobalSettingsOpen(false)}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-surface-border bg-surface-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Global settings</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Telemt server connections (stored in SQLite on the API host)
            </p>
          </div>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-200 text-xl leading-none"
            onClick={() => setGlobalSettingsOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Active: <span className="text-gray-200">{activeServer.name}</span>
            {activeServer.builtin && !activeServer.apiUrl.trim()
              ? " — API/metrics from environment (or set below)"
              : ` — ${effectiveUrl(activeServer.apiUrl, activeServer.envDefaults?.apiUrl)}`}
          </p>

          <ul className="space-y-2">
            {servers.map((server) => (
              <li
                key={server.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-surface-border bg-surface px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-gray-200">{server.name}</span>
                  {server.builtin ? (
                    <span className="text-gray-500 ml-2 text-xs">(default)</span>
                  ) : null}
                  <span className="text-gray-500 ml-2 block text-xs font-mono truncate max-w-md">
                    {server.builtin && !server.apiUrl.trim()
                      ? effectiveUrl("", server.envDefaults?.apiUrl) ||
                        "(from environment)"
                      : server.apiUrl}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="ui-btn ui-btn-ghost text-xs"
                    onClick={() => startEdit(server)}
                  >
                    Edit
                  </button>
                  {!server.builtin ? (
                    <button
                      type="button"
                      className="ui-btn ui-btn-red text-xs"
                      onClick={() => {
                        if (confirm(`Remove server "${server.name}"?`)) {
                          void removeServer(server.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {editingId ? (
            <div className="rounded border border-surface-border bg-surface p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-300">
                {editingId === "new"
                  ? "Add server"
                  : editingBuiltin
                    ? "Edit default server"
                    : "Edit server"}
              </h3>
              {editingBuiltin ? (
                <p className="text-xs text-gray-500">
                  Leave API or Metrics URL empty to use TELEMT_API_URL /
                  TELEMT_METRICS_URL from the API container environment.
                </p>
              ) : null}
              <label className="block text-sm">
                <span className="text-gray-500">Name</span>
                <input
                  className="ui-input w-full mt-1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500">API URL</span>
                <input
                  className="ui-input w-full mt-1 font-mono text-xs"
                  placeholder={
                    editingServer?.envDefaults?.apiUrl ?? "http://host:9091"
                  }
                  value={form.apiUrl}
                  onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500">Metrics URL</span>
                <input
                  className="ui-input w-full mt-1 font-mono text-xs"
                  placeholder={
                    editingServer?.envDefaults?.metricsUrl ?? "http://host:9092"
                  }
                  value={form.metricsUrl}
                  onChange={(e) =>
                    setForm({ ...form, metricsUrl: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500">Authorization header (optional)</span>
                <input
                  className="ui-input w-full mt-1 font-mono text-xs"
                  placeholder="Bearer token"
                  value={form.auth}
                  onChange={(e) => setForm({ ...form, auth: e.target.value })}
                />
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  className="ui-btn ui-btn-blue"
                  disabled={testing}
                  onClick={() => void testConnection()}
                >
                  Test connection
                </button>
                <button type="button" className="ui-btn ui-btn-blue" onClick={saveForm}>
                  Save
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </button>
                {testStatus ? (
                  <span
                    className={`text-xs ${testStatus === "Connection OK" ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {testStatus}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <button type="button" className="ui-btn ui-btn-blue" onClick={startAdd}>
              Add server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
