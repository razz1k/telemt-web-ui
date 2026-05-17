import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { RemoteServerBanner } from "../components/RemoteServerBanner";
import { ServiceTabs } from "../components/ServiceTabs";
import { useChangeNotify } from "../context/ChangeNotifyContext";
import { useServers } from "../context/ServerContext";
import { api } from "../lib/api";
import { isRemoteServer } from "../lib/servers";
import type { MvpConfig, MvpConfigUpdate } from "../lib/types";

export function SettingsPage() {
  const { notifyChange } = useChangeNotify();
  const { activeServer } = useServers();
  const remote = isRemoteServer(activeServer);
  const canEditConfig = !remote;
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["config", activeServer.id],
    queryFn: () => api.getConfig(),
  });

  const [form, setForm] = useState<MvpConfig | null>(null);

  useEffect(() => {
    if (configQuery.data) {
      setForm(configQuery.data);
    }
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("No form data");
      return api.putConfig({
        general: form.general,
        server: form.server,
        censorship: form.censorship,
      });
    },
    onMutate: () => {
      if (!configQuery.data) return;
      const previous: MvpConfigUpdate = {
        general: configQuery.data.general,
        server: configQuery.data.server,
        censorship: configQuery.data.censorship,
      };
      return { previous };
    },
    onSuccess: (_data, _vars, context) => {
      if (context?.previous) {
        notifyChange({
          message: "Settings saved",
          undo: async () => {
            await api.putConfig(context.previous);
            void queryClient.invalidateQueries({ queryKey: ["config", activeServer.id] });
          },
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["config", activeServer.id] });
    },
  });

  if (configQuery.isLoading || !form) {
    return (
      <div>
        <ServiceTabs />
        <p className="text-gray-500">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ServiceTabs />

      <RemoteServerBanner />

      <div>
        <h2 className="text-xl font-semibold">General Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Core telemt.toml parameters
        </p>
      </div>

      {!form.editable && !remote ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Config file is read-only. Set TELEMT_CONFIG_PATH in the API container to
          enable editing.
        </div>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canEditConfig) saveMutation.mutate();
        }}
      >
        <Card title="Proxy links (tg://)">
          <p className="text-xs text-gray-500 mb-3">
            Host and port embedded in generated proxy links for clients.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-gray-500">public_host</span>
              <div className="flex gap-2 mt-1">
                <input
                  className="ui-input flex-1"
                  value={form.general.links.public_host}
                  placeholder="proxy.example.com"
                  disabled={!form.editable || remote}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      general: {
                        ...form.general,
                        links: {
                          ...form.general.links,
                          public_host: e.target.value,
                        },
                      },
                    })
                  }
                />
                <button
                  type="button"
                  className="ui-btn ui-btn-blue shrink-0"
                  disabled={!form.editable || remote}
                  onClick={async () => {
                    try {
                      const { ip } = await api.publicIp();
                      if (ip) {
                        setForm({
                          ...form,
                          general: {
                            ...form.general,
                            links: {
                              ...form.general.links,
                              public_host: ip,
                            },
                          },
                        });
                      }
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Get IP
                </button>
              </div>
            </label>
            <label className="block text-sm">
              <span className="text-gray-500">public_port</span>
              <input
                type="number"
                className="ui-input w-full mt-1"
                value={form.general.links.public_port ?? ""}
                placeholder="same as server.port"
                disabled={!form.editable || remote}
                onChange={(e) =>
                  setForm({
                    ...form,
                    general: {
                      ...form.general,
                      links: {
                        ...form.general.links,
                        public_port:
                          e.target.value === ""
                            ? null
                            : Number.parseInt(e.target.value, 10) || 443,
                      },
                    },
                  })
                }
              />
            </label>
          </div>
        </Card>

        <Card title="General">
          <label className="block text-sm mb-3">
            <span className="text-gray-500">Log level</span>
            <select
              className="ui-input w-full mt-1"
              value={form.general.log_level}
              disabled={!form.editable || remote}
              onChange={(e) =>
                setForm({
                  ...form,
                  general: { ...form.general, log_level: e.target.value },
                })
              }
            >
              {["debug", "verbose", "normal", "silent"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            {(["classic", "secure", "tls"] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.general.modes[mode]}
                  disabled={!form.editable || remote}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      general: {
                        ...form.general,
                        modes: {
                          ...form.general.modes,
                          [mode]: e.target.checked,
                        },
                      },
                    })
                  }
                />
                {mode}
              </label>
            ))}
          </div>
        </Card>

        <Card title="Server">
          <label className="block text-sm">
            <span className="text-gray-500">Port</span>
            <input
              type="number"
              className="ui-input w-full mt-1"
              value={form.server.port}
              disabled={!form.editable || remote}
              onChange={(e) =>
                setForm({
                  ...form,
                  server: {
                    ...form.server,
                    port: Number.parseInt(e.target.value, 10) || 443,
                  },
                })
              }
            />
          </label>
        </Card>

        <Card title="Censorship / TLS mask">
          <label className="block text-sm mb-3">
            <span className="text-gray-500">TLS domain (SNI)</span>
            <input
              className="ui-input w-full mt-1"
              value={form.censorship.tls_domain}
              disabled={!form.editable || remote}
              onChange={(e) =>
                setForm({
                  ...form,
                  censorship: {
                    ...form.censorship,
                    tls_domain: e.target.value,
                  },
                })
              }
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.censorship.mask}
                disabled={!form.editable || remote}
                onChange={(e) =>
                  setForm({
                    ...form,
                    censorship: {
                      ...form.censorship,
                      mask: e.target.checked,
                    },
                  })
                }
              />
              mask
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.censorship.tls_emulation}
                disabled={!form.editable || remote}
                onChange={(e) =>
                  setForm({
                    ...form,
                    censorship: {
                      ...form.censorship,
                      tls_emulation: e.target.checked,
                    },
                  })
                }
              />
              tls_emulation
            </label>
          </div>
        </Card>

        <Card title="API (read-only)">
          <dl className="text-sm space-y-1 text-gray-400">
            <div>Listen: {form.server_api.listen}</div>
            <div>Enabled: {String(form.server_api.enabled)}</div>
            <div>Minimal runtime: {String(form.server_api.minimal_runtime_enabled)}</div>
            <div>Auth configured: {String(form.server_api.has_auth_header)}</div>
            <div className="font-mono text-xs break-all">Path: {form.config_path}</div>
          </dl>
        </Card>

        {form.editable && canEditConfig ? (
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="ui-btn ui-btn-blue px-6"
          >
            Save &amp; Apply
          </button>
        ) : null}

        {saveMutation.error ? (
          <p className="text-sm text-red-400">{(saveMutation.error as Error).message}</p>
        ) : null}
      </form>
    </div>
  );
}
