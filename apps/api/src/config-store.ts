import { readFile, writeFile } from "node:fs/promises";
import { parse, stringify } from "smol-toml";
import { config } from "./env.js";

export interface MvpConfig {
  general: {
    log_level: string;
    modes: {
      classic: boolean;
      secure: boolean;
      tls: boolean;
    };
    links: {
      public_host: string;
      public_port: number | null;
    };
  };
  server: {
    port: number;
    metrics_port?: number;
    metrics_listen?: string;
  };
  censorship: {
    tls_domain: string;
    mask: boolean;
    tls_emulation: boolean;
  };
  server_api: {
    enabled: boolean;
    listen: string;
    minimal_runtime_enabled: boolean;
    has_auth_header: boolean;
  };
  editable: boolean;
  config_path: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export async function readMvpConfig(): Promise<MvpConfig> {
  const path = config.telemtConfigPath;
  const editable = path.length > 0;

  if (!editable) {
    return emptyMvpConfig(path, false);
  }

  try {
    const raw = await readFile(path, "utf8");
    const doc = parse(raw) as Record<string, unknown>;
    return mapTomlToMvp(doc, path, true);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return emptyMvpConfig(path, true);
    }
    throw err;
  }
}

function emptyMvpConfig(path: string, editable: boolean): MvpConfig {
  return {
    general: {
      log_level: "normal",
      modes: { classic: false, secure: false, tls: true },
      links: { public_host: "", public_port: null },
    },
    server: { port: 443, metrics_port: 9092 },
    censorship: {
      tls_domain: "google.com",
      mask: true,
      tls_emulation: true,
    },
    server_api: {
      enabled: true,
      listen: "0.0.0.0:9091",
      minimal_runtime_enabled: true,
      has_auth_header: false,
    },
    editable,
    config_path: path,
  };
}

function mapTomlToMvp(
  doc: Record<string, unknown>,
  path: string,
  editable: boolean,
): MvpConfig {
  const general = asRecord(doc.general);
  const modes = asRecord(general.modes);
  const links = asRecord(general.links);
  const server = asRecord(doc.server);
  const censorship = asRecord(doc.censorship);
  const serverApi = asRecord(server.api);

  return {
    general: {
      log_level: asString(general.log_level, "normal"),
      modes: {
        classic: asBool(modes.classic, false),
        secure: asBool(modes.secure, false),
        tls: asBool(modes.tls, true),
      },
      links: {
        public_host: asString(links.public_host, ""),
        public_port:
          links.public_port !== undefined && links.public_port !== null
            ? asNumber(links.public_port, 443)
            : null,
      },
    },
    server: {
      port: asNumber(server.port, 443),
      metrics_port: server.metrics_port !== undefined
        ? asNumber(server.metrics_port, 9092)
        : undefined,
      metrics_listen: typeof server.metrics_listen === "string"
        ? server.metrics_listen
        : undefined,
    },
    censorship: {
      tls_domain: asString(censorship.tls_domain, "google.com"),
      mask: asBool(censorship.mask, true),
      tls_emulation: asBool(censorship.tls_emulation, true),
    },
    server_api: {
      enabled: asBool(serverApi.enabled, true),
      listen: asString(serverApi.listen, "0.0.0.0:9091"),
      minimal_runtime_enabled: asBool(serverApi.minimal_runtime_enabled, true),
      has_auth_header:
        typeof serverApi.auth_header === "string" &&
        serverApi.auth_header.length > 0,
    },
    editable,
    config_path: path,
  };
}

export interface MvpConfigUpdate {
  general?: Partial<MvpConfig["general"]> & {
    links?: Partial<MvpConfig["general"]["links"]>;
  };
  server?: Partial<MvpConfig["server"]>;
  censorship?: Partial<MvpConfig["censorship"]>;
}

export async function writeMvpConfig(update: MvpConfigUpdate): Promise<MvpConfig> {
  const path = config.telemtConfigPath;
  if (!path) {
    throw new Error("Config path is not configured");
  }

  let doc: Record<string, unknown>;
  try {
    const raw = await readFile(path, "utf8");
    doc = parse(raw) as Record<string, unknown>;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      doc = {};
    } else {
      throw err;
    }
  }

  if (update.general) {
    const general = asRecord(doc.general);
    if (update.general.log_level !== undefined) {
      general.log_level = update.general.log_level;
    }
    if (update.general.modes) {
      const modes = asRecord(general.modes);
      if (update.general.modes.classic !== undefined) {
        modes.classic = update.general.modes.classic;
      }
      if (update.general.modes.secure !== undefined) {
        modes.secure = update.general.modes.secure;
      }
      if (update.general.modes.tls !== undefined) {
        modes.tls = update.general.modes.tls;
      }
      general.modes = modes;
    }
    if (update.general.links) {
      const links = asRecord(general.links);
      if (update.general.links.public_host !== undefined) {
        if (update.general.links.public_host === "") {
          delete links.public_host;
        } else {
          links.public_host = update.general.links.public_host;
        }
      }
      if (update.general.links.public_port !== undefined) {
        if (update.general.links.public_port === null) {
          delete links.public_port;
        } else {
          links.public_port = update.general.links.public_port;
        }
      }
      general.links = links;
    }
    doc.general = general;
  }

  if (update.server) {
    const server = asRecord(doc.server);
    if (update.server.port !== undefined) {
      server.port = update.server.port;
    }
    if (update.server.metrics_port !== undefined) {
      server.metrics_port = update.server.metrics_port;
    }
    if (update.server.metrics_listen !== undefined) {
      server.metrics_listen = update.server.metrics_listen;
    }
    doc.server = server;
  }

  if (update.censorship) {
    const censorship = asRecord(doc.censorship);
    if (update.censorship.tls_domain !== undefined) {
      censorship.tls_domain = update.censorship.tls_domain;
    }
    if (update.censorship.mask !== undefined) {
      censorship.mask = update.censorship.mask;
    }
    if (update.censorship.tls_emulation !== undefined) {
      censorship.tls_emulation = update.censorship.tls_emulation;
    }
    doc.censorship = censorship;
  }

  await writeFile(path, stringify(doc), "utf8");
  return readMvpConfig();
}
