import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { createUser, getUserByEmail, getUserById } from "../db/users.js";
import { getTenantByUserId } from "../db/tenants.js";
import { signToken } from "../auth/jwt.js";
import { provisionTenant } from "../tenant/provisioner.js";
import { requireAuth, type AuthRequest } from "../auth/middleware.js";

const router = Router();

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const existing = getUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();
  const now = Date.now();

  createUser({
    id: userId,
    email,
    password_hash: passwordHash,
    tier: "free",
    created_at: now,
    updated_at: now,
  });

  // Provision tenant immediately on registration
  const tenant = await provisionTenant(userId);

  const token = signToken({ userId, email, tier: "free" });

  res.status(201).json({
    token,
    user: { id: userId, email, tier: "free" },
    tenant: { id: tenant.id, status: tenant.status },
  });
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = getUserByEmail(email);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ userId: user.id, email: user.email, tier: user.tier });

  res.json({
    token,
    user: { id: user.id, email: user.email, tier: user.tier },
  });
});

router.get(
  "/me",
  requireAuth,
  (req: Request, res: Response): void => {
    const auth = (req as AuthRequest).auth;
    const user = getUserById(auth.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ id: user.id, email: user.email, tier: user.tier });
  }
);

export default router;
