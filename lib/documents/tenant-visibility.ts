import type {Prisma} from "@prisma/client";
import {prisma} from "../db";
import {documentEditAccessWhere} from "./access";

export type DocumentSharingActor = {id: string; role: string; allProperties?: boolean};
/** Global read access is not a grant to publish a document to a tenant. */
export function tenantDocumentSharingEditWhere(user: DocumentSharingActor): Prisma.DocumentWhereInput {
  if (user.role === "TENANT") return {id: {in: []}};
  return {AND: [documentEditAccessWhere({...user, allProperties: false}), {
    deletedAt: null, leaseId: {not: null}, taskEntryId: null, meterReadingEvidence: {none: {}},
  }]};
}
export function consistentTenantDocumentLease(doc: {propertyId: string; unitId: string | null; lease: {unitId: string; unit: {propertyId: string}} | null}) {
  return Boolean(doc.lease && doc.lease.unit.propertyId === doc.propertyId && (!doc.unitId || doc.unitId === doc.lease.unitId));
}
export async function editableTenantDocumentIds(user: DocumentSharingActor, documentIds: string[]) {
  if (!documentIds.length) return new Set<string>();
  const documents = await prisma.document.findMany({where: {id: {in: documentIds}, AND: [tenantDocumentSharingEditWhere(user)]}, select: {id: true, propertyId: true, unitId: true, lease: {select: {unitId: true, unit: {select: {propertyId: true}}}}}});
  return new Set(documents.filter(consistentTenantDocumentLease).map(doc => doc.id));
}

/** Exact public lease boundary, shared by the portal list and tenant download route. */
export function tenantSharedDocumentWhere(lease: {id: string; unitId: string; propertyId: string}): Prisma.DocumentWhereInput {
  return {leaseId: lease.id, propertyId: lease.propertyId, OR: [{unitId: null}, {unitId: lease.unitId}], taskEntryId: null, deletedAt: null, tenantVisible: true};
}
