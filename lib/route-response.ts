import { NextResponse } from "next/server";
import { redirectUrl } from "./redirect-url";

export function go(request: Request, path: string) {
  return NextResponse.redirect(redirectUrl(path, request), 303);
}

export function goWithMessage(request: Request, path: string, kind: "ok" | "error", message: string) {
  const hashIndex = path.indexOf("#");
  const base = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const separator = base.includes("?") ? "&" : "?";
  return go(request, `${base}${separator}${kind}=${encodeURIComponent(message)}${hash}`);
}

export function safeInternalReturnPath(value: FormDataEntryValue | string | null | undefined, fallback: string) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try { const parsed = new URL(value, "https://flatcloud.internal"); return parsed.origin === "https://flatcloud.internal" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback; } catch { return fallback; }
}
