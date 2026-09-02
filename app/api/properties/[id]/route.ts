import { PropertyOwnershipMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { canSeeAll } from "@/lib/auth";
import { go, goWithMessage } from "@/lib/route-response";
import { parsePropertyTechnicalForm, technicalDataJson } from "@/lib/property-technical";
import { reconcilePropertyDriveStructure } from "@/lib/storage/property-drive-reconciliation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId");
    if (ownerId && !canSeeAll(access.user.role)) throw new Error("Vlastnické údaje může změnit pouze generální správce.");
    const modeRaw = (text(form, "ownershipMode") || "WHOLE_OBJECT") as PropertyOwnershipMode;
    const ownershipMode = Object.values(PropertyOwnershipMode).includes(modeRaw) ? modeRaw : PropertyOwnershipMode.WHOLE_OBJECT;
    const communicationOwnerId = text(form, "communicationOwnerId");
    const managerId = text(form, "managerId");
    if (managerId && !await prisma.user.findFirst({ where: { id: managerId, active: true }, select: { id: true } })) throw new Error("Vybraný správce neexistuje.");
    const technicalData = technicalDataJson(parsePropertyTechnicalForm(form));
    const previous = await prisma.property.findUnique({ where: { id }, select: { managerId: true, name: true, active: true } });
    const property = await prisma.$transaction(async tx => {
      const updated = await tx.property.update({ where: { id }, data: {
        name: text(form, "name", true)!,
        address: text(form, "address", true)!,
        city: text(form, "city", true)!,
        postalCode: text(form, "postalCode"),
        note: text(form, "note"),
        technicalData,
        active: boolValue(form, "active"),
        ...(ownerId ? { ownerId, ownershipMode, communicationOwnerId: communicationOwnerId || ownerId, managerId: managerId || null } : {}),
      } });
      if (ownerId) await tx.propertyOwnership.upsert({ where: { propertyId_ownerId: { propertyId: id, ownerId } }, update: {}, create: { propertyId: id, ownerId, shareBasisPoints: ownershipMode === "WHOLE_OBJECT" ? 10000 : 0 } });
      if (ownerId && previous?.managerId && previous.managerId !== managerId) await tx.userProperty.deleteMany({ where: { userId: previous.managerId, propertyId: id } });
      if (ownerId && managerId) await tx.userProperty.upsert({ where: { userId_propertyId: { userId: managerId, propertyId: id } }, update: { permission: "ADMIN" }, create: { userId: managerId, propertyId: id, permission: "ADMIN" } });
      return updated;
    });
    await audit(access.user.id, "PROPERTY_UPDATED", "Property", property.id, { name: property.name, active: property.active, ownerId, ownershipMode, communicationOwnerId, managerId, technicalDataUpdated: true }, id);
    let driveWarning = "";
    if (process.env.FILE_STORAGE_DRIVER === "gdrive") {
      try {
        await reconcilePropertyDriveStructure(id, { actorUserId: access.user.id, reconcileDocuments: false });
      } catch (error) {
        console.warn("Property Google Drive reconciliation failed after database update.", { propertyId: id, previousName: previous?.name, expectedName: property.name, previousActive: previous?.active, expectedActive: property.active, errorClass: error instanceof Error ? error.name : "UnknownError" });
        driveWarning = " Změna je uložena, ale strukturu Google Drive se nepodařilo synchronizovat; lze ji bezpečně opravit z administrace.";
      }
    }
    return goWithMessage(request, `/nemovitosti/${id}/nastaveni`, "ok", `Změny nemovitosti byly uloženy.${driveWarning}`);
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/upravit`, "error", error instanceof Error ? error.message : "Změny se nepodařilo uložit.");
  }
}
