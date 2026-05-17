export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  revision?: string;
  error?: { code: string; message: string };
}

export interface HealthData {
  status: string;
  read_only: boolean;
}

export interface HealthReadyData {
  ready: boolean;
  reason?: string;
}

export interface SystemInfoData {
  version?: string;
  uptime_seconds?: number;
  /** @deprecated Telemt field name alias */
  uptime_secs?: number;
  config_path?: string;
  config_hash?: string;
  config_reload_count?: number;
  configured_users?: number;
}

/** GET /v1/stats/summary — see Telemt API.md */
export interface SummaryData {
  uptime_seconds?: number;
  connections_total?: number;
  connections_bad_total?: number;
  handshake_timeouts_total?: number;
  configured_users?: number;
}

export interface ConnectionsSummaryData {
  total_connections?: number;
  unique_ips?: number;
  top_users?: Array<{
    username: string;
    connections: number;
    rx_bytes?: number;
    tx_bytes?: number;
  }>;
}

export interface MinimalAllData {
  network_path?: {
    tg_path?: string;
    egress?: string;
  };
  me?: Record<string, unknown>;
}

export interface UserLinks {
  classic?: string[];
  secure?: string[];
  tls?: string[];
  tls_domains?: string[];
}

export interface UserInfo {
  username: string;
  secret?: string;
  max_tcp_conns?: number | null;
  data_quota_bytes?: number | null;
  data_used_bytes?: number;
  expiration_rfc3339?: string | null;
  max_unique_ips?: number | null;
  active_ips?: string[];
  in_runtime?: boolean;
  current_connections?: number;
  active_unique_ips?: number;
  active_unique_ips_list?: string[];
  links?: UserLinks;
  total_octets?: number;
  /** Download (proxy → client), from Prometheus when available */
  rx_bytes?: number;
  /** Upload (client → proxy), from Prometheus when available */
  tx_bytes?: number;
}

export interface UserActiveIps {
  username: string;
  ips: string[];
}

export interface MvpConfig {
  general: {
    log_level: string;
    modes: { classic: boolean; secure: boolean; tls: boolean };
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

export type ServiceState = "RUNNING" | "STARTING" | "STOPPED" | "UNKNOWN";

export type MvpConfigUpdate = {
  general?: Partial<MvpConfig["general"]> & {
    links?: Partial<MvpConfig["general"]["links"]>;
  };
  server?: Partial<MvpConfig["server"]>;
  censorship?: Partial<MvpConfig["censorship"]>;
};
