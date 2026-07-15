import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requirePortfolioManager, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await requirePortfolioManager();
  if (!user) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId", true)!;
    const owner = await prisma.owner.findFirst({ where: { id: ownerId, active: true }, select: { id: true } });
    if (!owner) throw new Error("Vybraný vlastník neexistuje nebo není aktivní.");
    const property = await prisma.property.create({
      data: {
        name: text(form, "name", true)!,
        address: text(form, "address", true)!,
        city: text(form, "city", true)!,
        postalCode: text(form, "postalCode"),
        note: text(form, "note"),
        ownerId,
      },
    });
    await audit(user.id, "PROPERTY_CREATED", "Property", property.id, { name: property.name, ownerId });
    return goWithMessage(request, `/nemovitosti/${property.id}/prehled`, "ok", "Nemovitost byla vytvořena.");
  } catch (error) {
    return goWithMessage(request, "/nemovitosti/nova", "error", error instanceof Error ? error.message : "Nemovitost se nepodařilo vytvořit.");
  }
}
