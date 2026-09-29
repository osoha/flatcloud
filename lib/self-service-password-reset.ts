import { createHash, randomBytes } from "node:crypto";

export const resetLifetimeMs = 30 * 60_000;
export const resetTokenPattern = /^[A-Za-z0-9_-]{43}$/;
export function newPasswordResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPasswordResetToken(token) };
}
export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
