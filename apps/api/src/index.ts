import Fastify from "fastify";
import cors from "@fastify/cors";
import { checkWebUiAuth } from "./auth.js";
import { config } from "./env.js";
import { readMvpConfig, writeMvpConfig } from "./config-store.js";
import { initDatabase, resolveServerIdFromRequest } from "./db/index.js";
import {
  deleteSecretForUserPath,
  enrichUserList,
  extractAndStoreSecretFromResponse,
  storeSecretFromRequestBody,
  syncSecretsFromConfig,
} from "./db/secrets.js";
import { request as httpRequest } from "undici";
import { fetchTelemtMetrics, proxyToTelemtApi } from "./proxy.js";
import { resetAccumulatedTraffic, formatAccumulatedPrometheus } from "./db/traffic.js";
import { registerServerRoutes } from "./routes/servers.js";
import { resolveProxyTarget } from "./target.js";
import { startTrafficPoller } from "./traffic-poller.js";

initDatabase();
void syncSecretsFromConfig();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health" || request.url.startsWith("/health?")) {
    return;
  }
  if (!checkWebUiAuth(request, reply)) {
    return reply;
  }
});

await registerServerRoutes(app);

app.get("/health", async () => ({
  ok: true,
  data: {
    service: "telemt-web-ui-api",
    telemt_api_url: config.telemtApiUrl,
    config_editable: config.telemtConfigPath.length > 0,
    db_path: config.dbPath,
  },
}));

app.get("/api/tools/public-ip", async (request, reply) => {
  try {
    const response = await httpRequest("https://api.ipify.org?format=json", {
      method: "GET",
    });
    const body = (await response.body.json()) as { ip?: string };
    return reply.send({ ok: true, data: { ip: body.ip ?? "" } });
  } catch (err) {
    request.log.error(err);
    return reply.code(502).send({
      ok: false,
      error: { code: "bad_gateway", message: "Failed to fetch public IP" },
    });
  }
});

app.get("/api/config", async (request, reply) => {
  const target = resolveProxyTarget(request);
  if (target.isRemote) {
    return reply.send({
      ok: true,
      data: {
        general: {
          log_level: "normal",
          modes: { classic: false, secure: false, tls: true },
          links: { public_host: "", public_port: null },
        },
        server: { port: 443 },
        censorship: {
          tls_domain: "",
          mask: true,
          tls_emulation: true,
        },
        server_api: {
          enabled: true,
          listen: "",
          minimal_runtime_enabled: true,
          has_auth_header: false,
        },
        editable: false,
        config_path: "",
      },
    });
  }
  try {
    const data = await readMvpConfig();
    return reply.send({ ok: true, data });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({
      ok: false,
      error: { code: "internal_error", message: "Failed to read config" },
    });
  }
});

app.put("/api/config", async (request, reply) => {
  const target = resolveProxyTarget(request);
  if (target.isRemote) {
    return reply.code(403).send({
      ok: false,
      error: {
        code: "forbidden",
        message:
          "Config editing is only available for the default server with a local API URL (leave API URL empty or match TELEMT_API_URL)",
      },
    });
  }
  if (!config.telemtConfigPath) {
    return reply.code(403).send({
      ok: false,
      error: { code: "forbidden", message: "Config editing is disabled" },
    });
  }

  try {
    const body = request.body as Parameters<typeof writeMvpConfig>[0];
    const data = await writeMvpConfig(body ?? {});
    await syncSecretsFromConfig();
    return reply.send({ ok: true, data });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({
      ok: false,
      error: { code: "internal_error", message: "Failed to write config" },
    });
  }
});

app.get("/api/metrics", async (request, reply) => {
  const target = resolveProxyTarget(request);
  const serverId = resolveServerIdFromRequest(
    request.headers as Record<string, string | string[] | undefined>,
  );
  try {
    const result = await fetchTelemtMetrics(target);
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    if (result.statusCode !== 200) {
      return reply.code(result.statusCode).send(result.body);
    }
    const body = result.body + formatAccumulatedPrometheus(serverId);
    return reply.code(200).send(body);
  } catch (err) {
    request.log.error(err);
    return reply.code(502).send({
      ok: false,
      error: { code: "bad_gateway", message: "Failed to fetch metrics" },
    });
  }
});

app.delete<{ Querystring: { username?: string } }>(
  "/api/traffic/accumulated",
  async (request, reply) => {
    const serverId = resolveServerIdFromRequest(
      request.headers as Record<string, string | string[] | undefined>,
    );
    const username = request.query.username?.trim() || undefined;
    const changes = resetAccumulatedTraffic(serverId, username);
    return reply.send({
      ok: true,
      data: { serverId, username: username ?? null, rowsCleared: changes },
    });
  },
);

function enrichUsersResponse(
  serverId: string,
  path: string,
  parsed: { ok?: boolean; data?: unknown },
): typeof parsed {
  if (!parsed.ok || parsed.data === undefined) return parsed;

  if (path === "/v1/users" && Array.isArray(parsed.data)) {
    return {
      ...parsed,
      data: enrichUserList(
        parsed.data as Array<{ username: string; secret?: string }>,
        serverId,
      ),
    };
  }

  const userMatch = /^\/v1\/users\/([^/]+)$/.exec(path);
  if (userMatch && parsed.data && typeof parsed.data === "object") {
    const user = parsed.data as { username: string; secret?: string };
    const [enriched] = enrichUserList([user], serverId);
    return { ...parsed, data: enriched };
  }

  return parsed;
}

const proxyMethods = ["GET", "POST", "PATCH", "DELETE"] as const;

for (const method of proxyMethods) {
  app.route({
    method,
    url: "/api/v1/*",
    handler: async (request, reply) => {
      const wildcard = (request.params as { "*": string })["*"];
      const query = request.url.includes("?")
        ? request.url.slice(request.url.indexOf("?"))
        : "";
      const path = `/v1/${wildcard}${query}`;
      const apiPath = path.includes("?") ? path.slice(0, path.indexOf("?")) : path;
      const target = resolveProxyTarget(request);
      const serverId = resolveServerIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const reqHeaders = request.headers as Record<
        string,
        string | string[] | undefined
      >;

      try {
        const requestBody =
          method === "GET" || method === "DELETE"
            ? undefined
            : typeof request.body === "string"
              ? request.body
              : request.body
                ? JSON.stringify(request.body)
                : undefined;

        if (request.body && method !== "GET") {
          storeSecretFromRequestBody(
            serverId,
            apiPath,
            method,
            request.body,
          );
        }

        const result = await proxyToTelemtApi(
          target,
          method,
          path,
          requestBody,
          reqHeaders,
        );

        if (method === "DELETE" && apiPath.startsWith("/v1/users/")) {
          deleteSecretForUserPath(serverId, apiPath);
        }

        for (const [key, value] of Object.entries(result.headers)) {
          reply.header(key, value);
        }

        if (result.headers["content-type"]?.includes("application/json")) {
          const parsed = JSON.parse(result.body || "{}") as {
            ok?: boolean;
            data?: unknown;
          };

          extractAndStoreSecretFromResponse(
            serverId,
            apiPath,
            method,
            parsed,
          );

          if (
            method === "POST" &&
            parsed.ok &&
            /^\/v1\/users\/([^/]+)\/reset-quota$/.test(apiPath)
          ) {
            const match = /^\/v1\/users\/([^/]+)\/reset-quota$/.exec(apiPath);
            if (match) {
              resetAccumulatedTraffic(
                serverId,
                decodeURIComponent(match[1]),
              );
            }
          }

          let outbound = parsed;
          if (method === "GET" && apiPath.startsWith("/v1/users")) {
            outbound = enrichUsersResponse(serverId, apiPath, parsed);
          }

          return reply.code(result.statusCode).send(outbound);
        }

        return reply.code(result.statusCode).send(result.body);
      } catch (err) {
        request.log.error(err);
        return reply.code(502).send({
          ok: false,
          error: { code: "bad_gateway", message: "Telemt API unreachable" },
        });
      }
    },
  });
}

startTrafficPoller(app.log);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
