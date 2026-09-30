import { processAvatarUpload } from "@/lib/avatar";
import { NextResponse } from "next/server";
import { currentUser, hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess, requireUnitAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { loadEntityPhotoCandidates } from "@/lib/entity-photos";
import { appearanceColors, entityAppearanceKey } from "@/lib/entity-appearance-values";
import { goWithMessage } from "@/lib/route-response";
import { validIllustration } from "@/lib/illustration-library";

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
    const update: { favorite?: boolean; color?: string | null; photoId?: string | null; avatarData?: Uint8Array<ArrayBuffer> | null; avatarMimeType?: string | null } = {};
    const shared: { avatarPhotoId?: string; avatarData?: Uint8Array<ArrayBuffer> | null; avatarMimeType?: string | null } = {};
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
      if (!unitId && !hasAllPropertyAccess(user) && !property.memberships.some(member => member.userId === user.id && ["EDIT", "ADMIN"].includes(member.permission))) throw new Error("Nemáte oprávnění měnit společný avatar objektu.");
      if (photoId === "upload") {
        const uploaded = await processAvatarUpload(form.get("avatar"));
        const previous = unitId ? await prisma.userEntityAppearance.findUnique({where:{userId_entityKey:{userId:user.id,entityKey:entityAppearanceKey(id,unitId)}},select:{avatarMimeType:true}}) : property;
        if (uploaded) Object.assign(unitId ? update : shared, uploaded);
        else if (!previous?.avatarMimeType) throw new Error("Vyberte fotografii avatara.");
      } else if (validIllustration(photoId, unitId ? "unit" : "house")) {
        // Bundled illustration: no document access lookup required.
      } else if (photoId && photoId !== "icon") {
        const candidates = await loadEntityPhotoCandidates(user, [id]);
        if (!candidates.some(photo => photo.id === photoId && (photo.unitId || "") === unitId)) throw new Error("Tato fotografie není pro objekt dostupná.");
      }
      if (unitId) update.photoId = photoId || "icon";
      else {
        shared.avatarPhotoId = photoId || "icon";
        if (photoId !== "upload") Object.assign(shared, { avatarData: null, avatarMimeType: null });
      }
    }
    if (!Object.keys(update).length && !Object.keys(shared).length) throw new Error("Vyberte nastavení k uložení.");
    await prisma.$transaction(async tx => {
      if (Object.keys(shared).length) await tx.property.update({ where: { id }, data: shared });
      if (Object.keys(update).length) {
        const entityKey = entityAppearanceKey(id, unitId);
        await tx.userEntityAppearance.upsert({ where: { userId_entityKey: { userId: user.id, entityKey } }, create: { userId: user.id, entityKey, ...update }, update });
      }
    });
    return json ? NextResponse.json({ ok: true }) : goWithMessage(request, back, "ok", "Úprava karty byla uložena.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nastavení se nepodařilo uložit.";
    return json ? NextResponse.json({ error: message }, { status: 400 }) : goWithMessage(request, back, "error", message);
  }
}
