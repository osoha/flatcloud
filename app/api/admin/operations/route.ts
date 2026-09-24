import { NextResponse } from "next/server";
import { actualUser } from "@/lib/auth";
import { loadAdminOperations } from "@/lib/admin-operations";

export async function GET() {
  const user = await actualUser();
  if (!user) return NextResponse.json({ error: "Přihlášení vypršelo." }, { status: 401 });
  if (user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Přístup není povolen." }, { status: 403 });
  try {
    return NextResponse.json(await loadAdminOperations(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Statistiky nyní nejsou dostupné." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
