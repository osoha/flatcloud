import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadAdminOperations } from "@/lib/admin-operations";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Přihlášení vypršelo." }, { status: 401 });
  if (user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Přístup není povolen." }, { status: 403 });
  return NextResponse.json(await loadAdminOperations(), { headers: { "Cache-Control": "no-store" } });
}
