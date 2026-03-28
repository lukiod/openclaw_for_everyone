import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { createTenant, allocatePort } from "../db/tenants.js";
import { processManager } from "./process-manager.js";
import type { Tenant } from "../db/schema.js";

export function getTenantDataRoot(): string {
  return process.env.OPENCLAW_TENANTS_DIR ?? "/data/tenants";
}

export async function provisionTenant(userId: string): Promise<Tenant> {
  const tenantId = uuidv4();
  const configDir = path.join(getTenantDataRoot(), userId);
  const port = allocatePort();
  const gatewayToken = randomBytes(32).toString("hex");

  // Create directory layout OpenClaw expects
  fs.mkdirSync(path.join(configDir, "workspace"), { recursive: true });
  fs.mkdirSync(path.join(configDir, "sessions"), { recursive: true });

  // Write a minimal openclaw.json for this tenant
  const config = {
    meta: { lastTouchedVersion: "2026.3.27", lastTouchedAt: Date.now() },
    auth: { mode: "token", token: gatewayToken },
    agents: {
      defaults: { model: "claude-sonnet-4-5", thinkingDefault: false },
      list: [{ id: "main", name: "Main" }],
    },
    session: { scope: "per-sender" },
  };
  fs.writeFileSync(
    path.join(configDir, "openclaw.json"),
    JSON.stringify(config, null, 2),
    "utf8"
  );

  const tenant: Tenant = {
    id: tenantId,
    user_id: userId,
    config_dir: configDir,
    gateway_port: port,
    status: "stopped",
    pid: null,
    last_active_at: Date.now(),
    created_at: Date.now(),
    gateway_token: gatewayToken,
  };

  createTenant(tenant);
  return tenant;
}

export async function startTenant(tenant: Tenant): Promise<void> {
  await processManager.start(tenant);
}

export async function stopTenant(tenant: Tenant): Promise<void> {
  await processManager.stop(tenant.id);
}
