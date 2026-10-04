import {actualUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {hasTenantPortalAccess,manageableTenantLeaseIds} from "@/lib/tenant-portal-access";
import {leaseStatusAt} from "@/lib/lease-lifecycle-core";
import {normalizeAvatarBytes} from "@/lib/avatar";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{tenantId:string;userId:string}>}) {
  const {tenantId,userId}=await params,actor=await actualUser();if(!actor)return new Response(null,{status:404});
  const tenantAccess=await hasTenantPortalAccess(actor.id,actor.email,tenantId),ids=tenantAccess?[]:await manageableTenantLeaseIds(actor,tenantId);
  if(!tenantAccess&&!ids.length)return new Response(null,{status:404});
  const leases=await prisma.lease.findMany({where:{...(!tenantAccess?{id:{in:ids}}:{}),unit:{property:{managerId:userId}},OR:[{tenantId},{parties:{some:{tenantId,role:{in:["CONTRACTING_PARTY","PAYER"]}}}}]}});
  if(!leases.some(lease=>leaseStatusAt(lease)==="ACTIVE"))return new Response(null,{status:404});
  const manager=await prisma.user.findUnique({where:{id:userId},select:{avatarData:true,avatarMimeType:true}});if(!manager?.avatarData||!manager.avatarMimeType)return new Response(null,{status:404});
  return new Response(new Uint8Array(await normalizeAvatarBytes(manager.avatarData)),{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store"}});
}
