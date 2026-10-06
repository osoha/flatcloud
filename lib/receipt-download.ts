/** Downloads use the immutable receipt snapshot, never the tenant's current profile. */
export function receiptDownloadDisposition(snapshot: unknown): string {
  const data = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as Record<string, unknown> : {};
  const period = typeof data.period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(data.period) ? data.period : "";
  const rawName = typeof data.tenantName === "string" ? data.tenantName : "";
  const name = Array.from(rawName.normalize("NFC")
    .replace(/^(?:(?:ing(?:\.\s*arch)?|mgr|bc|mudr|judr|phdr|rndr|doc|prof)\.\s*)+/i, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, ""))
    .slice(0, 80).join("").replace(/-+$/g, "");
  const filename = ["Doklad", period, name || "najem"].filter(Boolean).join("-") + ".pdf";
  const ascii = filename.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9.-]+/g, "-");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
