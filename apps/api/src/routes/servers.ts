import type { FastifyInstance } from "fastify";
import {
  createServer,
  deleteServer,
  listServers,
  setActiveServerId,
  updateServer,
} from "../db/servers.js";

interface CreateServerBody {
  name?: string;
  apiUrl?: string;
  metricsUrl?: string;
  auth?: string;
}

export async function registerServerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/servers", async (_request, reply) => {
    return reply.send({ ok: true, data: listServers() });
  });

  app.post("/api/servers", async (request, reply) => {
    const body = (request.body ?? {}) as CreateServerBody;
    if (!body.name?.trim()) {
      return reply.code(400).send({
        ok: false,
        error: { code: "bad_request", message: "name is required" },
      });
    }
    const server = createServer({
      name: body.name,
      apiUrl: body.apiUrl ?? "",
      metricsUrl: body.metricsUrl ?? "",
      auth: body.auth ?? "",
    });
    return reply.code(201).send({ ok: true, data: server });
  });

  app.patch("/api/servers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as CreateServerBody;
    const server = updateServer(id, {
      name: body.name,
      apiUrl: body.apiUrl,
      metricsUrl: body.metricsUrl,
      auth: body.auth,
    });
    if (!server) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "Server not found or not editable" },
      });
    }
    return reply.send({ ok: true, data: server });
  });

  app.delete("/api/servers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!deleteServer(id)) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "Server not found or builtin" },
      });
    }
    return reply.send({ ok: true, data: { id } });
  });

  app.put("/api/servers/active", async (request, reply) => {
    const body = (request.body ?? {}) as { id?: string };
    if (!body.id?.trim()) {
      return reply.code(400).send({
        ok: false,
        error: { code: "bad_request", message: "id is required" },
      });
    }
    setActiveServerId(body.id.trim());
    return reply.send({ ok: true, data: { activeServerId: body.id.trim() } });
  });
}
