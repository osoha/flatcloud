import {currentUser} from "@/lib/auth";
import {tenantDocumentSharingEditWhere, consistentTenantDocumentLease} from "@/lib/documents/tenant-visibility";
import {goWithMessage, safeInternalReturnPath} from "@/lib/route-response";
import {guideOriginMatches} from "@/lib/guide-origin";
import {serializableTransaction} from "@/lib/serializable";

export async function POST(request: Request, {params}: {params: Promise<{leaseId: string; documentId: string}>}) {
  const {leaseId, documentId} = await params, fallback = `/smlouvy/${leaseId}#dokumenty`;
  const user = await currentUser();
  if (!user || user.role === "TENANT" || request.headers.get("sec-fetch-site") === "cross-site" || !guideOriginMatches(request)) return new Response("Nemáte oprávnění.", {status: 403});
  let target = fallback;
  try {
    const form = await request.formData();
    target = safeInternalReturnPath(form.get("returnTo"), fallback);
    const raw = form.get("tenantVisible");
    if (raw !== "true" && raw !== "false") throw new Error("Vyberte, zda má být dokument dostupný nájemníkovi.");
    const visible = raw === "true";
    await serializableTransaction(async tx => {
      const doc = await tx.document.findFirst({where: {id: documentId, leaseId, AND: [tenantDocumentSharingEditWhere(user)]}, select: {id: true, propertyId: true, unitId: true, tenantVisible: true, lease: {select: {unitId: true, unit: {select: {propertyId: true}}}}}});
      if (!doc || !consistentTenantDocumentLease(doc)) throw new Error("Nemáte oprávnění změnit sdílení tohoto dokumentu.");
      if (doc.tenantVisible === visible) return;
      await tx.document.update({where: {id: documentId}, data: {tenantVisible: visible}});
      await tx.auditLog.create({data: {userId: user.id, propertyId: doc.propertyId, action: "TENANT_DOCUMENT_VISIBILITY_CHANGED", entityType: "Document", entityId: doc.id, details: {from: doc.tenantVisible, to: visible, leaseId}}});
    });
    return goWithMessage(request, target, "ok", visible ? "Dokument je zpřístupněný nájemníkovi. V portálu se zobrazí u aktivní smlouvy." : "Dokument je nyní pouze pro správu a v portálu nájemníka se nezobrazuje.");
  } catch (error) {return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Sdílení dokumentu se nepodařilo změnit.");}
}
