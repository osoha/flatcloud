import { NextResponse } from "next/server";
import { hasAllPropertyAccess } from "@/lib/auth";
import { editableUnitWhere } from "@/lib/access";
import { serializableTransaction } from "@/lib/serializable";
import { getSubscriptionSummary } from "@/lib/subscriptions/service";
import { billingReturnPath, checked, enumField, requiredField, subscriptionActor, subscriptionFailure, subscriptionForm, subscriptionSuccess } from "@/app/api/subscriptions/_shared";

export const dynamic = "force-dynamic";

class ArchivePermissionError extends Error {}

/** A narrow recovery action: only archive, never delete or change unrelated fields. */
export async function POST(request: Request) {
  const boundary = await subscriptionActor(request);
  if (boundary.response) return boundary.response;
  let path = "/ucet/predplatne";
  try {
    const form = await subscriptionForm(request);
    path = billingReturnPath(form, boundary.actor.role === "SUPER_ADMIN");
    const accountId = requiredField(form, "accountId", 100);
    const entityType = enumField(form, "entityType", ["unit", "property"] as const);
    const entityId = requiredField(form, "entityId", 100);
    if (!checked(form, "confirmArchive")) throw new Error("Potvrďte archivaci vybrané nemovitosti. Data zůstanou uložená.");
    const actor = boundary.actor;
    const result = await serializableTransaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "SubscriptionAccount" WHERE "id" = ${accountId} FOR UPDATE`;
      const summary = await getSubscriptionSummary(accountId, undefined, tx);
      if (!summary.recoveryArchivingAllowed) throw new Error("Archivace pro snížení kapacity je dostupná pouze u překročeného limitu. Nezaplacené předplatné nejprve obnovte.");
      let propertyId: string;
      if (entityType === "unit") {
        const unit = await tx.unit.findFirst({ where: { id: entityId, AND: editableUnitWhere(actor) }, select: { id: true, propertyId: true, status: true, operationalStatus: true } });
        if (!unit) throw new ArchivePermissionError("K archivaci této jednotky nemáte oprávnění.");
        propertyId = unit.propertyId;
        if (!summary.scopes.some(scope => scope.propertyId === propertyId && (!scope.unitId || scope.unitId === unit.id))) throw new ArchivePermissionError("Jednotka nepatří do zvoleného předplatného.");
        if (unit.status === "INACTIVE" || unit.operationalStatus === "INACTIVE") throw new Error("Jednotka už je archivovaná.");
        // Preserve occupancy status. The native editor restores operationalStatus
        // and applies its atomic subscription capacity check on reactivation.
        await tx.unit.update({ where: { id: unit.id }, data: { operationalStatus: "INACTIVE", operationalStatusEvents: { create: { status: "INACTIVE", source: "USER_CHANGE", createdById: actor.id, effectiveAt: new Date() } } } });
      } else {
        const property = await tx.property.findUnique({ where: { id: entityId }, select: { id: true, active: true, memberships: { where: { userId: actor.id, permission: { in: ["EDIT", "ADMIN"] } }, select: { userId: true } } } });
        if (!property || (!hasAllPropertyAccess(actor) && !property.memberships.length)) throw new ArchivePermissionError("K archivaci tohoto objektu nemáte oprávnění.");
        propertyId = property.id;
        if (!summary.scopes.some(scope => scope.propertyId === propertyId && !scope.unitId)) throw new ArchivePermissionError("Celý objekt není pokrytý zvoleným předplatným. Archivujte pouze své jednotky.");
        if (!property.active) throw new Error("Objekt už je archivovaný.");
        await tx.property.update({ where: { id: property.id }, data: { active: false } });
      }
      const reason = "Archivace pro snížení překročené kapacity předplatného; data zůstávají uložená.";
      await tx.auditLog.create({ data: { userId: actor.id, action: "SUBSCRIPTION_RECOVERY_ARCHIVED", entityType: entityType === "unit" ? "Unit" : "Property", entityId, propertyId, details: { accountId, reason } } });
      await tx.subscriptionAudit.create({ data: { accountId, actorId: actor.id, action: "CAPACITY_RECOVERY_ARCHIVED", reason, after: { entityType, entityId, propertyId } } });
      const updated = await getSubscriptionSummary(accountId, undefined, tx);
      return { entityType, entityId, usage: updated.usage, overCapacity: updated.overCapacity, writable: updated.writable };
    });
    return subscriptionSuccess(request, path, "Položka byla archivována. Její data zůstávají uložená a kapacita portfolia byla přepočítána.", result);
  } catch (error) {
    if (error instanceof ArchivePermissionError) return NextResponse.json({ error: error.message }, { status: 403, headers: { "Cache-Control": "no-store" } });
    return subscriptionFailure(request, path, error);
  }
}
