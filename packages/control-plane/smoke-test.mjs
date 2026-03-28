/**
 * Smoke test for the control-plane API.
 * Starts the server in-process, runs assertions, then exits.
 *
 * Run: node smoke-test.mjs
 */

import { strict as assert } from "node:assert";

const BASE = "http://127.0.0.1:13001";
const EMAIL = `test-${Date.now()}@example.com`;
const PASSWORD = "test-password-123";

let token = null;

async function req(method, path, body, auth) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers["Authorization"] = `Bearer ${auth}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function run() {
  console.log("=== OpenClaw Control-Plane Smoke Test ===\n");

  // 1. Healthz
  {
    const { status, body } = await req("GET", "/healthz");
    assert.equal(status, 200, "/healthz should return 200");
    assert.equal(body.ok, true, "/healthz body.ok should be true");
    console.log("✓  GET  /healthz");
  }

  // 2. Register
  {
    const { status, body } = await req("POST", "/api/auth/register", {
      email: EMAIL,
      password: PASSWORD,
    });
    assert.equal(status, 201, `Register should return 201, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.token, "Register should return a token");
    assert.equal(body.user.email, EMAIL);
    assert.equal(body.user.tier, "free");
    assert.ok(body.tenant?.id, "Register should return tenant info");
    token = body.token;
    console.log("✓  POST /api/auth/register");
  }

  // 3. Duplicate register
  {
    const { status } = await req("POST", "/api/auth/register", {
      email: EMAIL,
      password: PASSWORD,
    });
    assert.equal(status, 409, "Duplicate register should return 409");
    console.log("✓  POST /api/auth/register (duplicate → 409)");
  }

  // 4. Login
  {
    const { status, body } = await req("POST", "/api/auth/login", {
      email: EMAIL,
      password: PASSWORD,
    });
    assert.equal(status, 200, `Login should return 200, got ${status}`);
    assert.ok(body.token, "Login should return a token");
    token = body.token;
    console.log("✓  POST /api/auth/login");
  }

  // 5. Bad login
  {
    const { status } = await req("POST", "/api/auth/login", {
      email: EMAIL,
      password: "wrong-password",
    });
    assert.equal(status, 401, "Bad login should return 401");
    console.log("✓  POST /api/auth/login (wrong password → 401)");
  }

  // 6. /me
  {
    const { status, body } = await req("GET", "/api/auth/me", null, token);
    assert.equal(status, 200, `/me should return 200, got ${status}`);
    assert.equal(body.email, EMAIL);
    console.log("✓  GET  /api/auth/me");
  }

  // 7. /me without auth
  {
    const { status } = await req("GET", "/api/auth/me");
    assert.equal(status, 401, "/me without auth should return 401");
    console.log("✓  GET  /api/auth/me (no auth → 401)");
  }

  // 8. Tenant status (gateway won't actually start in smoke test — that's fine)
  {
    const { status, body } = await req("GET", "/api/tenant/status", null, token);
    assert.equal(status, 200, `/api/tenant/status should return 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.id, "Tenant status should include id");
    assert.ok(["stopped", "running", "hibernated", "error"].includes(body.status));
    console.log(`✓  GET  /api/tenant/status (status=${body.status})`);
  }

  console.log("\n✅  All smoke tests passed\n");
}

// ---- Start server then run tests ----

process.env.CONTROL_PLANE_JWT_SECRET = "smoke-test-secret-do-not-use-in-production";
process.env.CONTROL_PLANE_PORT = "13001";
process.env.CONTROL_PLANE_DATA_DIR = "/tmp/openclaw-smoke-test-" + Date.now();
process.env.OPENCLAW_TENANTS_DIR = "/tmp/openclaw-smoke-tenants-" + Date.now();

// Import after env is set
const { createServer } = await import("node:http");
const { default: express } = await import("express");
const { getDb } = await import("./dist/db/schema.js");
const { default: authRoutes } = await import("./dist/routes/auth.js");
const { default: tenantRoutes } = await import("./dist/routes/tenant.js");

getDb(); // run migrations

const app = express();
app.use(express.json());
app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/auth", authRoutes);
app.use("/api/tenant", tenantRoutes);

const server = createServer(app);
server.listen(13001, "127.0.0.1", async () => {
  try {
    await run();
    server.close(() => process.exit(0));
  } catch (err) {
    console.error("\n❌  Smoke test FAILED:", err.message);
    server.close(() => process.exit(1));
  }
});
