import { Router, type Request, type Response } from "express";
import { requireAuth, type AuthRequest } from "../auth/middleware.js";
import { getTenantByUserId } from "../db/tenants.js";
import { processManager } from "../tenant/process-manager.js";
import { provisionTenant, startTenant, stopTenant } from "../tenant/provisioner.js";

const router = Router();

router.use(requireAuth);

router.get("/status", (req: Request, res: Response): void => {
  const { userId } = (req as AuthRequest).auth;
  const tenant = getTenantByUserId(userId);

  if (!tenant) {
    res.status(404).json({ error: "No tenant found. Please re-register." });
    return;
  }

  // Reflect live in-memory status
  const liveRunning = processManager.isRunning(tenant.id);

  res.json({
    id: tenant.id,
    status: liveRunning ? "running" : tenant.status,
    gateway_port: tenant.gateway_port,
    last_active_at: tenant.last_active_at,
    created_at: tenant.created_at,
  });
});

router.post("/start", async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthRequest).auth;
  const tenant = getTenantByUserId(userId);

  if (!tenant) {
    res.status(404).json({ error: "No tenant found" });
    return;
  }

  if (processManager.isRunning(tenant.id)) {
    res.json({ status: "already_running" });
    return;
  }

  try {
    await startTenant(tenant);
    res.json({ status: "started" });
  } catch (err) {
    console.error("[tenant/start] error:", err);
    res.status(500).json({ error: "Failed to start gateway" });
  }
});

router.post("/stop", async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthRequest).auth;
  const tenant = getTenantByUserId(userId);

  if (!tenant) {
    res.status(404).json({ error: "No tenant found" });
    return;
  }

  try {
    await stopTenant(tenant);
    res.json({ status: "stopped" });
  } catch (err) {
    console.error("[tenant/stop] error:", err);
    res.status(500).json({ error: "Failed to stop gateway" });
  }
});

export default router;
