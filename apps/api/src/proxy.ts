import { request } from "undici";
import type { ProxyTarget } from "./target.js";

function buildHeaders(
  target: ProxyTarget,
  incoming: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const contentType = incoming["content-type"];
  if (typeof contentType === "string") {
    headers["content-type"] = contentType;
  }
  if (incoming["if-match"] && typeof incoming["if-match"] === "string") {
    headers["if-match"] = incoming["if-match"];
  }
  if (target.apiAuth) {
    headers.authorization = target.apiAuth;
  }
  return headers;
}

export async function proxyToTelemtApi(
  target: ProxyTarget,
  method: string,
  pathWithQuery: string,
  body?: string,
  incomingHeaders: Record<string, string | string[] | undefined> = {},
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const url = `${target.apiUrl}${pathWithQuery}`;
  const response = await request(url, {
    method: method as "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
    headers: buildHeaders(target, incomingHeaders),
    body: body && body.length > 0 ? body : undefined,
  });

  const text = await response.body.text();
  const headers: Record<string, string> = {};
  const contentType = response.headers["content-type"];
  if (typeof contentType === "string") {
    headers["content-type"] = contentType;
  }
  const etag = response.headers.etag;
  if (typeof etag === "string") {
    headers.etag = etag;
  }

  return {
    statusCode: response.statusCode,
    headers,
    body: text,
  };
}

export async function fetchTelemtMetrics(
  target: ProxyTarget,
): Promise<{ statusCode: number; body: string }> {
  const url = `${target.metricsUrl}/metrics`;
  const response = await request(url, {
    method: "GET",
    headers: target.apiAuth ? { authorization: target.apiAuth } : {},
  });
  const body = await response.body.text();
  return { statusCode: response.statusCode, body };
}
