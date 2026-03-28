import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type User = {
  id: string;
  email: string;
  password_hash: string;
  tier: "free" | "pro";
  created_at: number;
  updated_at: number;
};

export type Tenant = {
  id: string;
  user_id: string;
  config_dir: string;
  gateway_port: number;
  status: "running" | "stopped" | "hibernated" | "error";
  pid: number | null;
  last_active_at: number;
  created_at: number;
  gateway_token: string;
};

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dataDir = process.env.CONTROL_PLANE_DATA_DIR ?? "/data/control-plane";
  fs.mkdirSync(dataDir, { recursive: true });

  _db = new Database(path.join(dataDir, "control-plane.db"));
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  applyMigrations(_db);
  return _db;
}

function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM migrations").all() as { name: string }[]).map(
      (r) => r.name
    )
  );

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: "001_initial",
      sql: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          tier TEXT NOT NULL DEFAULT 'free',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE tenants (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE,
          config_dir TEXT NOT NULL UNIQUE,
          gateway_port INTEGER NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'stopped',
          pid INTEGER,
          last_active_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          gateway_token TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_tenants_user_id ON tenants(user_id);
        CREATE INDEX idx_tenants_gateway_port ON tenants(gateway_port);
      `,
    },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    db.exec(migration.sql);
    db.prepare(
      "INSERT INTO migrations (name, applied_at) VALUES (?, ?)"
    ).run(migration.name, Date.now());
  }
}
