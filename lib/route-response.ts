import { NextResponse } from "next/server";
import { redirectUrl } from "./redirect-url";

export function go(request: Request, path: string) {
  return NextResponse.redirect(redirectUrl(path, request), 303);
}

export function goWithMessage(request: Request, path: string, kind: "ok" | "error", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return go(request, `${path}${separator}${kind}=${encodeURIComponent(message)}`);
}
