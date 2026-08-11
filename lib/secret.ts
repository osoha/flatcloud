import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MIN_SECRET_LENGTH = 24;

function configuredSecrets() {
  return [process.env.BANK_TOKEN_ENCRYPTION_KEY, process.env.SESSION_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value.length >= MIN_SECRET_LENGTH))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function keys() {
  const secrets = configuredSecrets();
  if (!secrets.length) throw new Error("Chybí dostatečně dlouhý SESSION_SECRET nebo BANK_TOKEN_ENCRYPTION_KEY. Automatický cron musí sdílet stejný šifrovací klíč jako webová služba.");
  return secrets.map((secret) => createHash("sha256").update(secret).digest());
}

export function secretConfigurationStatus() {
  const bankKey = Boolean(process.env.BANK_TOKEN_ENCRYPTION_KEY && process.env.BANK_TOKEN_ENCRYPTION_KEY.trim().length >= MIN_SECRET_LENGTH);
  const sessionKey = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= MIN_SECRET_LENGTH);
  return { bankKey, sessionKey, available: bankKey || sessionKey };
}

export function sealSecret(value?: string | null) {
  if (!value) return null;
  const [encryptionKey] = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function openSecret(value?: string | null) {
  if (!value) return undefined;
  const [version, ivRaw, tagRaw, payloadRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !payloadRaw) throw new Error("Neplatný formát šifrované hodnoty.");
  const availableKeys = keys();
  let lastError: unknown;
  for (const decryptionKey of availableKeys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", decryptionKey, Buffer.from(ivRaw, "base64url"));
      decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(payloadRaw, "base64url")), decipher.final()]).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Šifrovanou hodnotu nelze otevřít dostupným klíčem. Webová služba a cron musí používat stejný BANK_TOKEN_ENCRYPTION_KEY / SESSION_SECRET.${lastError instanceof Error && lastError.message ? ` (${lastError.message})` : ""}`);
}
