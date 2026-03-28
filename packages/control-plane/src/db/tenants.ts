import { getDb, type Tenant } from "./schema.js";

const PORT_START = 19000;
const PORT_END = 29000;

export function createTenant(tenant: Tenant): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO tenants
       (id, user_id, config_dir, gateway_port, status, pid, last_active_at, created_at, gateway_token)
     VALUES
       (@id, @user_id, @config_dir, @gateway_port, @status, @pid, @last_active_at, @created_at, @gateway_token)`
  ).run(tenant);
}

export function getTenantByUserId(userId: string): Tenant | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM tenants WHERE user_id = ?")
    .get(userId) as Tenant | undefined;
}

export function getTenantById(id: string): Tenant | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM tenants WHERE id = ?")
    .get(id) as Tenant | undefined;
}

export function updateTenantStatus(
  tenantId: string,
  status: Tenant["status"],
  pid: number | null
): void {
  const db = getDb();
  db.prepare(
    "UPDATE tenants SET status = ?, pid = ? WHERE id = ?"
  ).run(status, pid, tenantId);
}

export function touchTenant(tenantId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE tenants SET last_active_at = ? WHERE id = ?"
  ).run(Date.now(), tenantId);
}

export function getAllTenants(): Tenant[] {
  const db = getDb();
  return db.prepare("SELECT * FROM tenants").all() as Tenant[];
}

export function getRunningTenants(): Tenant[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM tenants WHERE status = 'running'")
    .all() as Tenant[];
}

export function getIdleTenants(idleMs: number): Tenant[] {
  const db = getDb();
  const cutoff = Date.now() - idleMs;
  return db
    .prepare(
      "SELECT * FROM tenants WHERE status = 'running' AND last_active_at < ?"
    )
    .all(cutoff) as Tenant[];
}

export function allocatePort(): number {
  const db = getDb();
  const usedPorts = new Set(
    (
      db
        .prepare("SELECT gateway_port FROM tenants")
        .all() as { gateway_port: number }[]
    ).map((r) => r.gateway_port)
  );

  for (let port = PORT_START; port <= PORT_END; port++) {
    if (!usedPorts.has(port)) return port;
  }

  throw new Error("No available ports for new tenant");
}
