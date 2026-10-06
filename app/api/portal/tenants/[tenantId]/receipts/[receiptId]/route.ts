import { receiptDownloadDisposition } from "@/lib/receipt-download";
import {actualUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {hasTenantPortalAccess} from "@/lib/tenant-portal-access";
import {leaseStatusAt} from "@/lib/lease-lifecycle-core";
export async function GET(_request:Request,{params}:{params:Promise<{tenantId:string;receiptId:string}>}) {
  const {tenantId,receiptId}=await params,user=await actualUser();
  if(!user||!await hasTenantPortalAccess(user.id,user.email,tenantId))return new Response("Not found",{status:404});
  const receipt=await prisma.tenantPaymentReceipt.findFirst({where:{id:receiptId,charge:{lease:{OR:[{tenantId},{parties:{some:{tenantId,role:"CONTRACTING_PARTY"}}}]}}},include:{charge:{include:{lease:true}}}});
  if(!receipt||leaseStatusAt(receipt.charge.lease)!=="ACTIVE")return new Response("Not found",{status:404});
  return new Response(new Uint8Array(receipt.pdfData),{headers:{"Content-Type":"application/pdf","Cache-Control":"private, no-store","Content-Disposition":receiptDownloadDisposition(receipt.snapshot)}});
}
