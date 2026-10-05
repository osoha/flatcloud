import {currentUser} from "@/lib/auth";
import {leaseAccessWhere} from "@/lib/access";
import {prisma} from "@/lib/db";
import {tenantPortalEntryPdf,type PortalEntryDocumentKind} from "@/lib/tenant-portal-entry-pdf";

export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{leaseId:string}>}) {
  const actor=await currentUser();if(!actor)return new Response("Not found",{status:404});
  const {leaseId}=await params,kind=new URL(request.url).searchParams.get("kind");
  if(kind!=="contract"&&kind!=="handover")return new Response("Not found",{status:404});
  const lease=await prisma.lease.findFirst({where:{id:leaseId,...leaseAccessWhere(actor)},select:{tenantId:true,contractNumber:true,unit:{select:{label:true,property:{select:{name:true}}}}}});
  if(!lease)return new Response("Not found",{status:404});
  try {
    const bytes=await tenantPortalEntryPdf({tenantId:lease.tenantId,propertyName:lease.unit.property.name,unitLabel:lease.unit.label,contractNumber:lease.contractNumber,kind:kind as PortalEntryDocumentKind});
    return new Response(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Cache-Control":"private, no-store","Content-Disposition":`attachment; filename="flatberry-portal-${kind}-${leaseId}.pdf"`}});
  }catch(error){console.error("Tenant portal entry PDF failed",{leaseId,error});return new Response("Přílohu se nepodařilo vytvořit.",{status:503});}
}
