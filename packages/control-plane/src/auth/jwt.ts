import jwt from "jsonwebtoken";

export type JwtPayload = {
  userId: string;
  email: string;
  tier: "free" | "pro";
};

function getSecret(): string {
  const secret = process.env.CONTROL_PLANE_JWT_SECRET;
  if (!secret) throw new Error("CONTROL_PLANE_JWT_SECRET env var is required");
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}
