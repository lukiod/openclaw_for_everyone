import { getDb, type User } from "./schema.js";

export function createUser(user: User): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, tier, created_at, updated_at)
     VALUES (@id, @email, @password_hash, @tier, @created_at, @updated_at)`
  ).run(user);
}

export function getUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as User | undefined;
}

export function updateUserTier(userId: string, tier: "free" | "pro"): void {
  const db = getDb();
  db.prepare(
    "UPDATE users SET tier = ?, updated_at = ? WHERE id = ?"
  ).run(tier, Date.now(), userId);
}
