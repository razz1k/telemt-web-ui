export function envString(key: string, fallback = ""): string {
  const value = process.env[key];
  return value !== undefined && value !== "" ? value : fallback;
}

export const config = {
  port: Number.parseInt(envString("API_PORT", "3000"), 10),
  telemtApiUrl: envString("TELEMT_API_URL", "http://telemt:9091").replace(/\/$/, ""),
  telemtMetricsUrl: envString("TELEMT_METRICS_URL", "http://telemt:9092").replace(/\/$/, ""),
  telemtConfigPath: envString("TELEMT_CONFIG_PATH", "/etc/telemt/config.toml"),
  telemtApiAuth: envString("TELEMT_API_AUTH"),
  webUiPassword: envString("WEB_UI_PASSWORD"),
  dbPath: envString("UI_DB_PATH", "/var/lib/telemt-web-ui/state.db"),
};
