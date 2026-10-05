import {actualUser} from "@/lib/auth";
import {createFileStorage, fileStorageCapabilities} from "@/lib/storage";
import {activeTenantLease} from "@/lib/tenant-portal-access";
import {tenantSharedDocumentWhere} from "@/lib/documents/tenant-visibility";
import {serializableTransaction} from "@/lib/serializable";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, {params}: {params: Promise<{tenantId: string; documentId: string}>}) {
  const user = await actualUser(), {tenantId, documentId} = await params;
  if (!user) return new Response("Not found", {status: 404});
  const doc = await serializableTransaction(async tx => {
    const target = await tx.document.findUnique({where: {id: documentId}, select: {leaseId: true}});
    if (!target?.leaseId) return null;
    const lease = await activeTenantLease(user.id, tenantId, target.leaseId, tx);
    if (!lease) return null;
    return tx.document.findFirst({where: {id: documentId, AND: [tenantSharedDocumentWhere({id: lease.id, unitId: lease.unitId, propertyId: lease.unit.propertyId})]}, include: {fileAsset: true}});
  });
  if (!doc) return new Response("Not found", {status: 404});
  const key = doc.fileAsset.storageKey, storage = createFileStorage();
  const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileAsset.originalName)}`;
  if (fileStorageCapabilities().signedDownloads) return Response.redirect(await storage.getSignedDownloadUrl(key, 300, {contentDisposition: disposition, contentType: doc.fileAsset.mimeType}), 302);
  return new Response(await storage.getObject(key), {headers: {"Cache-Control": "private, no-store", "Content-Type": doc.fileAsset.mimeType, "Content-Disposition": disposition}});
}
