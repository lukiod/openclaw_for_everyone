import { spawn, type ChildProcess } from "node:child_process";
import { updateTenantStatus, getAllTenants, getIdleTenants } from "../db/tenants.js";
import type { Tenant } from "../db/schema.js";

// How long a tenant gateway must be idle before hibernation (default: 30 min)
const HIBERNATE_IDLE_MS = Number(
  process.env.CONTROL_PLANE_HIBERNATE_IDLE_MS ?? 30 * 60 * 1000
);
const HEALTH_CHECK_INTERVAL_MS = 60_000;

// In-memory map of tenantId → child process (for this process's lifetime)
const processes = new Map<string, ChildProcess>();

function resolveOpenClawBin(): string {
  return process.env.OPENCLAW_BIN ?? "node";
}

function resolveOpenClawArgs(): string[] {
  const bin = process.env.OPENCLAW_BIN;
  // If OPENCLAW_BIN points to the binary directly, no extra args needed.
  // Otherwise, assume we're running `node dist/index.js`.
  if (bin) return [];
  const distIndex =
    process.env.OPENCLAW_DIST_INDEX ??
    "/app/dist/index.js";
  return [distIndex];
}

export const processManager = {
  async start(tenant: Tenant): Promise<void> {
    if (processes.has(tenant.id)) {
      // Already tracked in-memory — just ensure DB is consistent
      updateTenantStatus(tenant.id, "running", processes.get(tenant.id)!.pid ?? null);
      return;
    }

    const bin = resolveOpenClawBin();
    const args = [...resolveOpenClawArgs(), "gateway", "--bind", "loopback", "--port", String(tenant.gateway_port)];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: "/home/node",
      OPENCLAW_CONFIG_DIR: tenant.config_dir,
      OPENCLAW_GATEWAY_TOKEN: tenant.gateway_token,
      OPENCLAW_GATEWAY_BIND: "loopback",
    };

    const child = spawn(bin, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    processes.set(tenant.id, child);
    updateTenantStatus(tenant.id, "running", child.pid ?? null);

    child.stdout?.on("data", (data: Buffer) => {
      process.stdout.write(`[tenant:${tenant.id.slice(0, 8)}] ${data}`);
    });

    child.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[tenant:${tenant.id.slice(0, 8)}] ${data}`);
    });

    child.on("exit", (code) => {
      processes.delete(tenant.id);
      const status = code === 0 ? "stopped" : "error";
      updateTenantStatus(tenant.id, status, null);
      console.log(`[process-manager] Tenant ${tenant.id} exited (code=${code})`);
    });

    // Wait briefly for gateway to become ready
    await waitForGateway(tenant.gateway_port, 15_000);
  },

  async stop(tenantId: string): Promise<void> {
    const child = processes.get(tenantId);
    if (!child) {
      updateTenantStatus(tenantId, "stopped", null);
      return;
    }
    child.kill("SIGTERM");
    processes.delete(tenantId);
    updateTenantStatus(tenantId, "stopped", null);
  },

  isRunning(tenantId: string): boolean {
    return processes.has(tenantId);
  },

  async ensureRunning(tenant: Tenant): Promise<void> {
    if (!this.isRunning(tenant.id)) {
      await this.start(tenant);
    }
  },

  /** Restore any tenants that were running before a control-plane restart */
  async restoreRunningTenants(): Promise<void> {
    const tenants = getAllTenants().filter((t) => t.status === "running");
    console.log(`[process-manager] Restoring ${tenants.length} previously-running tenants`);
    for (const tenant of tenants) {
      try {
        await this.start(tenant);
      } catch (err) {
        console.error(`[process-manager] Failed to restore tenant ${tenant.id}:`, err);
        updateTenantStatus(tenant.id, "error", null);
      }
    }
  },

  startHibernationLoop(): void {
    setInterval(() => {
      const idle = getIdleTenants(HIBERNATE_IDLE_MS);
      for (const tenant of idle) {
        console.log(`[process-manager] Hibernating idle tenant ${tenant.id}`);
        this.stop(tenant.id)
          .then(() => updateTenantStatus(tenant.id, "hibernated", null))
          .catch((err) =>
            console.error(`[process-manager] Hibernate error for ${tenant.id}:`, err)
          );
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  },
};

async function waitForGateway(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Gateway on port ${port} did not become healthy within ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
