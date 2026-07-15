import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { redirectUrl } from "@/lib/redirect-url";

export async function POST(request: Request) {
  await clearSession();
  return NextResponse.redirect(redirectUrl("/login", request), 303);
}
