import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { canSeeAll } from "@/lib/auth";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId");
    if (ownerId && !canSeeAll(access.user.role)) throw new Error("Vlastníka může změnit pouze generální správce.");
    const property = await prisma.property.update({
      where: { id },
      data: {
        name: text(form, "name", true)!,
        address: text(form, "address", true)!,
        city: text(form, "city", true)!,
        postalCode: text(form, "postalCode"),
        note: text(form, "note"),
        active: boolValue(form, "active"),
        ...(ownerId ? { ownerId } : {}),
      },
    });
    if (ownerId) await prisma.propertyOwnership.upsert({ where: { propertyId_ownerId: { propertyId: id, ownerId } }, update: {}, create: { propertyId: id, ownerId, shareBasisPoints: 10000 } });
    await audit(access.user.id, "PROPERTY_UPDATED", "Property", property.id, { name: property.name });
    return goWithMessage(request, `/nemovitosti/${id}/nastaveni`, "ok", "Změny nemovitosti byly uloženy.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/upravit`, "error", error instanceof Error ? error.message : "Změny se nepodařilo uložit.");
  }
}
