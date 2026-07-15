import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ProviderCredentials } from "./types";

function key() {
  const secret = process.env.BANK_TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error("Chybí BANK_TOKEN_ENCRYPTION_KEY (nebo dostatečně dlouhý SESSION_SECRET).");
  return createHash("sha256").update(secret).digest();
}

export function sealCredentials(value?: ProviderCredentials) {
  if (!value || !Object.keys(value).length) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function openCredentials(value?: string | null): ProviderCredentials | undefined {
  if (!value) return undefined;
  const [version, ivRaw, tagRaw, payloadRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !payloadRaw) throw new Error("Neplatný formát bankovních přístupových údajů.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const clear = Buffer.concat([decipher.update(Buffer.from(payloadRaw, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(clear) as ProviderCredentials;
}
