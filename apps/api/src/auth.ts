import type { FastifyReply, FastifyRequest } from "fastify";
import { Buffer } from "node:buffer";
import { config } from "./env.js";

export function checkWebUiAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (!config.webUiPassword) {
    return true;
  }

  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    reply.header("WWW-Authenticate", 'Basic realm="telemt-web-ui"');
    reply.code(401).send({ ok: false, error: { code: "unauthorized", message: "Authentication required" } });
    return false;
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const password = decoded.includes(":") ? decoded.split(":").slice(1).join(":") : decoded;

  if (password !== config.webUiPassword) {
    reply.header("WWW-Authenticate", 'Basic realm="telemt-web-ui"');
    reply.code(401).send({ ok: false, error: { code: "unauthorized", message: "Invalid credentials" } });
    return false;
  }

  return true;
}
