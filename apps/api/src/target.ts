import type { FastifyRequest } from "fastify";
import { config } from "./env.js";

export interface ProxyTarget {
  apiUrl: string;
  metricsUrl: string;
  apiAuth: string;
  isRemote: boolean;
}

function headerString(
  request: FastifyRequest,
  name: string,
): string | undefined {
  const value = request.headers[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function normalizeBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveProxyTarget(request: FastifyRequest): ProxyTarget {
  const customApi = headerString(request, "x-telemt-api-url");
  const customMetrics = headerString(request, "x-telemt-metrics-url");
  const customAuth = headerString(request, "x-telemt-api-auth");

  const apiUrl = customApi
    ? normalizeBaseUrl(customApi) ?? config.telemtApiUrl
    : config.telemtApiUrl;

  const metricsUrl = customMetrics
    ? normalizeBaseUrl(customMetrics) ?? config.telemtMetricsUrl
    : config.telemtMetricsUrl;

  return {
    apiUrl,
    metricsUrl,
    apiAuth: customAuth ?? config.telemtApiAuth,
    isRemote: Boolean(customApi),
  };
}
