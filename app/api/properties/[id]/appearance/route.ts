import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { requirePropertyAccess, requireUnitAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { loadEntityPhotoCandidates } from "@/lib/entity-photos";
import { appearanceColors, entityAppearanceKey } from "@/lib/entity-appearance-values";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Přihlaste se znovu." }, { status: 401 });
  const { id } = await params;
  const property = await requirePropertyAccess(user, id);
  if (!property) return NextResponse.json({ error: "Objekt není dostupný." }, { status: 404 });
  const form = await request.formData();
  const unitId = String(form.get("unitId") || "");
  if (unitId && !await requireUnitAccess(user, id, unitId)) return NextResponse.json({ error: "Jednotka není dostupná." }, { status: 404 });
  const back = `/nemovitosti/${id}/vzhled${unitId ? `?unitId=${encodeURIComponent(unitId)}` : ""}`;
  const json = request.headers.get("accept")?.includes("application/json");
  try {
    const update: { favorite?: boolean; color?: string | null; photoId?: string | null } = {};
    if (form.has("favorite")) {
      if (unitId || !["true", "false"].includes(String(form.get("favorite")))) throw new Error("Neplatná volba oblíbených.");
      update.favorite = form.get("favorite") === "true";
    }
    if (form.has("color")) {
      const color = String(form.get("color"));
      if (!Object.hasOwn(appearanceColors, color)) throw new Error("Vyberte dostupnou barvu.");
      update.color = color || null;
    }
    if (form.has("photoId")) {
      const photoId = String(form.get("photoId") || "");
      if (photoId && photoId !== "icon") {
        const candidates = await loadEntityPhotoCandidates(user, [id]);
        if (!candidates.some(photo => photo.id === photoId && (photo.unitId || "") === unitId)) throw new Error("Tato fotografie není pro objekt dostupná.");
      }
      update.photoId = photoId || null;
    }
    if (!Object.keys(update).length) throw new Error("Vyberte nastavení k uložení.");
    const entityKey = entityAppearanceKey(id, unitId);
    await prisma.userEntityAppearance.upsert({ where: { userId_entityKey: { userId: user.id, entityKey } }, create: { userId: user.id, entityKey, ...update }, update });
    return json ? NextResponse.json({ ok: true }) : goWithMessage(request, back, "ok", "Váš vzhled byl uložen.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nastavení se nepodařilo uložit.";
    return json ? NextResponse.json({ error: message }, { status: 400 }) : goWithMessage(request, back, "error", message);
  }
}
