import {actualUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {createFileStorage,fileStorageCapabilities} from "@/lib/storage";
import {leaseStatusAt} from "@/lib/lease-lifecycle-core";
import {hasTenantPortalAccess} from "@/lib/tenant-portal-access";

export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{tenantId:string;documentId:string}>}) {
  const user=await actualUser();const {tenantId,documentId}=await params;
  if(!user||!await hasTenantPortalAccess(user.id,user.email,tenantId))return new Response("Not found",{status:404});
  const doc=await prisma.document.findFirst({where:{id:documentId,deletedAt:null,tenantVisible:true,lease:{OR:[{tenantId},{parties:{some:{tenantId,role:{in:["CONTRACTING_PARTY","PAYER"]}}}}]}},include:{lease:true,fileAsset:true}});
  if(!doc?.lease||leaseStatusAt(doc.lease)!=="ACTIVE")return new Response("Not found",{status:404});
  const key=doc.fileAsset.storageKey;const storage=createFileStorage();
  const disposition=`attachment; filename*=UTF-8''${encodeURIComponent(doc.fileAsset.originalName)}`;
  if(fileStorageCapabilities().signedDownloads)return Response.redirect(await storage.getSignedDownloadUrl(key,300,{contentDisposition:disposition,contentType:doc.fileAsset.mimeType}),302);
  return new Response(await storage.getObject(key),{headers:{"Cache-Control":"private, no-store","Content-Type":doc.fileAsset.mimeType,"Content-Disposition":disposition}});
}
