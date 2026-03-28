#!/usr/bin/env node
import express from "express";
import { createServer } from "node:http";
import { getDb } from "./db/schema.js";
import authRoutes from "./routes/auth.js";
import tenantRoutes from "./routes/tenant.js";
import { handleProxyRequest, handleProxyUpgrade } from "./proxy/index.js";
import { processManager } from "./tenant/process-manager.js";

const PORT = Number(process.env.CONTROL_PLANE_PORT ?? 3000);

// Validate required env vars early
if (!process.env.CONTROL_PLANE_JWT_SECRET) {
  console.error("FATAL: CONTROL_PLANE_JWT_SECRET is not set");
  process.exit(1);
}

// Initialize DB (runs migrations)
getDb();

const app = express();

app.use(express.json());

// Health check — no auth required
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Control-plane API routes
app.use("/api/auth", authRoutes);
app.use("/api/tenant", tenantRoutes);

// All other paths → reverse proxy to the authenticated user's gateway
app.use((req, res) => {
  handleProxyRequest(req, res).catch((err) => {
    console.error("[server] unhandled proxy error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
  });
});

const server = createServer(app);

// WebSocket upgrade → proxy to tenant gateway
server.on("upgrade", (req, socket, head) => {
  handleProxyUpgrade(req, socket as import("node:net").Socket, head).catch((err) => {
    console.error("[server] unhandled ws upgrade error:", err);
    socket.destroy();
  });
});

server.listen(PORT, () => {
  console.log(`[control-plane] Listening on port ${PORT}`);
});

// Restore tenants that were running before restart
processManager.restoreRunningTenants().catch((err) =>
  console.error("[control-plane] restore error:", err)
);

// Hibernate idle tenants automatically
processManager.startHibernationLoop();

// Graceful shutdown
function shutdown(): void {
  console.log("[control-plane] Shutting down...");
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
