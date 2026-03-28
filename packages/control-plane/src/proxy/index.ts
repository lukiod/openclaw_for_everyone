import httpProxy from "http-proxy";
import type { Request, Response } from "express";
import { type IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { verifyToken } from "../auth/jwt.js";
import { getTenantByUserId } from "../db/tenants.js";
import { processManager } from "../tenant/process-manager.js";
import { touchTenant } from "../db/tenants.js";
import type { Tenant } from "../db/schema.js";

const proxy = httpProxy.createProxyServer({ ws: true });

proxy.on("error", (err, _req, res) => {
  console.error("[proxy] Error:", err.message);
  if (res instanceof ServerResponse && !res.headersSent) {
    res.writeHead(502);
    res.end("Bad Gateway");
  }
});

async function resolveTenant(req: IncomingMessage): Promise<Tenant | null> {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  try {
    const payload = verifyToken(authHeader.slice(7));
    const tenant = getTenantByUserId(payload.userId);
    if (!tenant) return null;
    return tenant;
  } catch {
    return null;
  }
}

async function ensureTenantRunning(tenant: Tenant): Promise<void> {
  await processManager.ensureRunning(tenant);
  touchTenant(tenant.id);
}

export async function handleProxyRequest(req: Request, res: Response): Promise<void> {
  const tenant = await resolveTenant(req);
  if (!tenant) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    await ensureTenantRunning(tenant);
  } catch (err) {
    console.error(`[proxy] Failed to start tenant ${tenant.id}:`, err);
    res.status(503).json({ error: "Tenant gateway unavailable" });
    return;
  }

  const target = `http://127.0.0.1:${tenant.gateway_port}`;

  // Replace the Authorization header with the tenant's gateway token
  // so the upstream gateway accepts the request
  req.headers.authorization = `Bearer ${tenant.gateway_token}`;

  proxy.web(req, res, { target }, (err) => {
    console.error("[proxy] web error:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "Bad Gateway" });
    }
  });
}

export async function handleProxyUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer
): Promise<void> {
  const tenant = await resolveTenant(req);
  if (!tenant) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  try {
    await ensureTenantRunning(tenant);
  } catch (err) {
    console.error(`[proxy] Failed to start tenant ${tenant.id} for WS:`, err);
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }

  const target = `ws://127.0.0.1:${tenant.gateway_port}`;

  // Swap the auth token so upstream gateway accepts the WS handshake
  req.headers.authorization = `Bearer ${tenant.gateway_token}`;

  touchTenant(tenant.id);
  proxy.ws(req, socket, head, { target });
}
