import { PropertyOwnershipMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { requirePortfolioManager, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { safeBuildingType, technicalDataJson } from "@/lib/property-technical";
import { consolidationBasisPoints, safePropertyManagementScope } from "@/lib/ownership-scope";

export async function POST(request: Request) {
  const user = await requirePortfolioManager();
  if (!user) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId", true)!;
    const owner = await prisma.owner.findFirst({ where: { id: ownerId, active: true }, select: { id: true } });
    if (!owner) throw new Error("Vybraný vlastník neexistuje nebo není aktivní.");
    const modeRaw = (text(form, "ownershipMode") || "WHOLE_OBJECT") as PropertyOwnershipMode;
    const ownershipMode = Object.values(PropertyOwnershipMode).includes(modeRaw) ? modeRaw : PropertyOwnershipMode.WHOLE_OBJECT;
    const communicationOwnerId = text(form, "communicationOwnerId") || ownerId;
    const managerId = text(form, "managerId");
    if (managerId && !await prisma.user.findFirst({ where: { id: managerId, active: true }, select: { id: true } })) throw new Error("Vybraný správce neexistuje.");
    const wholeObject = boolValue(form, "wholeObjectOwner");
    const managementScope = safePropertyManagementScope(text(form, "managementScope"));
    const flatcloudConsolidationBasisPoints = consolidationBasisPoints(text(form, "flatcloudConsolidationPercent"));
    const property = await prisma.property.create({ data: {
      name: text(form, "name", true)!, address: text(form, "address", true)!, city: text(form, "city", true)!,
      postalCode: text(form, "postalCode"), note: text(form, "note"), technicalData: technicalDataJson({ buildingType: safeBuildingType(text(form, "buildingType")) }),
      ownerId, ownershipMode, communicationOwnerId, managerId, managementScope, flatcloudConsolidationBasisPoints,
      ownerships: { create: { ownerId, shareBasisPoints: wholeObject ? 10000 : 0 } },
      memberships: managerId ? { create: { userId: managerId, permission: "ADMIN" } } : undefined,
    } });
    await audit(user.id, "PROPERTY_CREATED", "Property", property.id, { propertyCode: property.propertyCode, ownerId, ownershipMode, communicationOwnerId, managerId, managementScope, flatcloudConsolidationBasisPoints });
    return goWithMessage(request, `/nemovitosti/${property.id}/prehled`, "ok", "Nemovitost byla vytvořena.");
  } catch (error) {
    return goWithMessage(request, "/nemovitosti/nova", "error", error instanceof Error ? error.message : "Nemovitost se nepodařilo vytvořit.");
  }
}
