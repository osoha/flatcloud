import {DocumentCategory, type Prisma} from "@prisma/client";
import {prisma} from "../db";
import {leaseAccessWhere} from "../access";
import {documentEditAccessWhere} from "./access";
import {requireDocumentCreateAccess} from "./service";
import type {DocumentSharingActor} from "./tenant-visibility";

const plainAttachment = {taskId: null, taskEntryId: null, complianceRecordId: null, propertyCostId: null, meterReadingEvidence: {none: {}}} satisfies Prisma.DocumentWhereInput;
const editActor = (user: DocumentSharingActor) => ({...user, allProperties: false});
export function documentMetadataEditWhere(user: DocumentSharingActor): Prisma.DocumentWhereInput {
  return user.role === "TENANT" ? {id: {in: []}} : {AND: [documentEditAccessWhere(editActor(user)), plainAttachment]};
}

export async function documentMetadataChoices(user: DocumentSharingActor, ids: string[]) {
  if (!ids.length) return new Map<string, Array<[string, string]>>();
  const docs = await prisma.document.findMany({where: {id: {in: ids}, AND: [documentMetadataEditWhere(user)]}, select: {
    id: true, propertyId: true, unitId: true, leaseId: true, lease: {select: {unitId: true}},
  }});
  const unitIds = docs.flatMap(doc => doc.unitId || doc.lease?.unitId ? [doc.unitId || doc.lease!.unitId] : []);
  const propertyIds = docs.filter(doc => !doc.unitId && !doc.lease).map(doc => doc.propertyId);
  const leases = await prisma.lease.findMany({where: {AND: [leaseAccessWhere(editActor(user)), {OR: [
    {unitId: {in: unitIds}}, {unit: {propertyId: {in: propertyIds}}},
  ]}, {OR: [{cancelledAt: null}, {id: {in: docs.flatMap(doc => doc.leaseId ? [doc.leaseId] : [])}}]}]},
    select: {id: true, unitId: true, contractNumber: true, startDate: true, endDate: true, cancelledAt: true, tenant: {select: {name: true}}, unit: {select: {propertyId: true, label: true}}},
    orderBy: [{startDate: "desc"}, {id: "asc"}],
  });
  const date = (value: Date) => value.toLocaleDateString("cs-CZ", {timeZone: "Europe/Prague"});
  return new Map(docs.map(doc => {
    const unitId = doc.unitId || doc.lease?.unitId;
    return [doc.id, leases.filter(lease => lease.unit.propertyId === doc.propertyId && (!unitId || lease.unitId === unitId) && (!lease.cancelledAt || lease.id === doc.leaseId))
      .map(lease => [lease.id, `${lease.contractNumber || "Bez čísla"} · ${lease.tenant.name} · ${lease.unit.label} · ${date(lease.startDate)} – ${lease.endDate ? date(lease.endDate) : "neurčito"}${lease.cancelledAt ? " · zrušená vazba" : ""}`] as [string, string])];
  }));
}

export async function updateDocumentMetadata(tx: Prisma.TransactionClient, user: DocumentSharingActor, id: string, input: {title: string; category: string; leaseId: string | null}) {
  const title = input.title.trim();
  if (!title || title.length > 250) throw new Error("Název dokumentu musí mít 1 až 250 znaků.");
  if (!Object.values(DocumentCategory).includes(input.category as DocumentCategory)) throw new Error("Vyberte platnou kategorii dokumentu.");
  const doc = await tx.document.findFirst({where: {id, AND: [documentMetadataEditWhere(user)]}, include: {lease: {select: {unitId: true}}}});
  if (!doc) throw new Error("Nemáte oprávnění upravit zařazení tohoto dokumentu.");
  const unitId = doc.unitId || doc.lease?.unitId;
  if (input.leaseId) {
    const lease = await tx.lease.findFirst({where: {id: input.leaseId, AND: [leaseAccessWhere(editActor(user))]}, select: {id: true, unitId: true, cancelledAt: true, unit: {select: {propertyId: true}}}});
    if (!lease || lease.unit.propertyId !== doc.propertyId || (unitId && lease.unitId !== unitId) || (lease.cancelledAt && lease.id !== doc.leaseId)) throw new Error("Vyberte smlouvu stejné jednotky v rozsahu vašich oprávnění.");
    await requireDocumentCreateAccess(editActor(user), {mode: "UNIT", propertyId: doc.propertyId, unitId: lease.unitId}, tx);
  } else if (unitId && ["CONTRACT", "CONTRACT_ADDENDUM", "HANDOVER_PROTOCOL"].includes(input.category)) {
    throw new Error("Ke smlouvě, dodatku nebo předávacímu protokolu vyberte konkrétní nájemní smlouvu.");
  }
  const reassigned = doc.leaseId !== input.leaseId;
  const tenantVisible = reassigned ? false : doc.tenantVisible;
  // A legacy document can have its only unit anchor through the lease.
  // Unlinking must retain that unit instead of widening it to the whole house.
  const retainedUnitId = doc.unitId || (reassigned && !input.leaseId ? unitId : null) || null;
  await tx.document.update({where: {id}, data: {title, category: input.category as DocumentCategory, unitId: retainedUnitId, leaseId: input.leaseId, tenantVisible, ...(input.category !== "PHOTO" ? {photoStage: null} : {})}});
  await tx.auditLog.create({data: {userId: user.id, propertyId: doc.propertyId, action: "DOCUMENT_METADATA_CHANGED", entityType: "Document", entityId: id, details: {
    before: {title: doc.title, category: doc.category, unitId: doc.unitId, leaseId: doc.leaseId, tenantVisible: doc.tenantVisible},
    after: {title, category: input.category, unitId: retainedUnitId, leaseId: input.leaseId, tenantVisible},
  }}});
  return {reassigned};
}
