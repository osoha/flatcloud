import {prisma} from "./db";
import {invitationToken} from "./invitations";
import {sealSecret} from "./secret";
import {sendTenantPortalInvitationEmail} from "./email";
import {leaseStatusAt} from "./lease-lifecycle-core";
import {tenantPortalContactMatches} from "./tenant-portal-access";

function inviteOrigin() {
  const raw=process.env.RENDER_EXTERNAL_URL||process.env.APP_URL;
  if(!raw)throw new Error("Pro automatickou pozvánku chybí APP_URL.");
  const url=new URL(raw);
  if(url.protocol!=="https:"&&url.hostname!=="localhost"&&url.hostname!=="127.0.0.1")throw new Error("Pozvánka vyžaduje bezpečnou adresu aplikace.");
  return url;
}

export async function runAutoTenantPortalInvitations(onlyLeaseId?:string) {
  const rows=await prisma.lease.findMany({where:{autoPortalInvitationPending:true,...(onlyLeaseId?{id:onlyLeaseId}:{})},select:{id:true,startDate:true,endDate:true,terminatedOn:true,cancelledAt:true},orderBy:{startDate:"asc"},take:onlyLeaseId?1:100});
  let invited=0,waiting=0,skipped=0,failed=0;
  for(const row of rows){
    if(leaseStatusAt(row)==="FUTURE"){waiting++;continue;}
    try{
      const result=await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM "Lease" WHERE id = ${row.id} FOR UPDATE`;
        const lease=await tx.lease.findUniqueOrThrow({where:{id:row.id},include:{tenant:{include:{portalAccesses:{include:{user:{select:{email:true,active:true}}}}}},unit:{include:{property:{include:{manager:{select:{id:true,name:true,active:true}}}}}}}});
        if(!lease.autoPortalInvitationPending)return null;
        if(leaseStatusAt(lease)==="FUTURE")return null;
        const property=lease.unit.property;
        const email=(lease.tenant.communicationEmail||lease.tenant.email||"").trim().toLowerCase();
        const existing=await tx.user.findUnique({where:{email},select:{id:true,active:true}});
        const hasAccess=lease.tenant.portalAccesses.some(a=>a.user.active&&tenantPortalContactMatches(a.user.email,lease.tenant));
        const pending=await tx.userInvitation.findFirst({where:{tenantId:lease.tenantId,email,status:"PENDING",expiresAt:{gt:new Date()}},select:{id:true}});
        if(property.tenantPortalInvitationMode!=="AUTOMATIC"||leaseStatusAt(lease)!=="ACTIVE"||!/^\S+@\S+\.\S+$/.test(email)||hasAccess||pending||existing&&!existing.active){
          await tx.lease.update({where:{id:lease.id},data:{autoPortalInvitationPending:false}});
          return {kind:"skipped" as const};
        }
        const inviter=property.manager?.active?property.manager:await tx.user.findFirst({where:{role:"SUPER_ADMIN",active:true},select:{id:true,name:true},orderBy:{createdAt:"asc"}});
        if(!inviter)throw new Error("Chybí aktivní správce pro automatickou pozvánku.");
        const {token,tokenHash}=invitationToken();
        const url=new URL(`/pozvanka/${token}`,inviteOrigin()).toString();
        const invite=await tx.userInvitation.create({data:{email,name:lease.tenant.name,tokenHash,tokenEncrypted:sealSecret(token),tenantId:lease.tenantId,propertyId:property.id,role:"TENANT",permission:"VIEW",invitedById:inviter.id,expiresAt:new Date(Date.now()+7*86400000)}});
        await tx.lease.update({where:{id:lease.id},data:{autoPortalInvitationPending:false}});
        await tx.auditLog.create({data:{userId:inviter.id,propertyId:property.id,action:"TENANT_PORTAL_AUTO_INVITED",entityType:"UserInvitation",entityId:invite.id,details:{leaseId:lease.id,tenantId:lease.tenantId,email}}});
        return {kind:"created" as const,id:invite.id,email,inviterName:inviter.name,url};
      });
      if(!result){waiting++;continue;}
      if(result.kind==="skipped"){skipped++;continue;}
      const sandbox=process.env.RENDER_GIT_BRANCH?.startsWith("sandbox/")||process.env.RENDER_EXTERNAL_URL?.includes("sandbox")||/\.(test|invalid)$/.test(result.email);
      try{
        const sent=sandbox?{sent:false,reason:"Sandbox: e-mail se neposílá."}:await sendTenantPortalInvitationEmail({to:result.email,inviterName:result.inviterName,inviteUrl:result.url});
        await prisma.userInvitation.update({where:{id:result.id},data:sent.sent?{sentAt:new Date(),deliveryError:null}:{deliveryError:sent.reason||"E-mail se nepodařilo odeslat."}});
        if(sent.sent||sandbox)invited++;else failed++;
      }catch(error){failed++;await prisma.userInvitation.update({where:{id:result.id},data:{deliveryError:error instanceof Error?error.message:"E-mail se nepodařilo odeslat."}});}
    }catch(error){failed++;console.error("Tenant portal automatic invitation failed",{leaseId:row.id,error});}
  }
  return {invited,waiting,skipped,failed,summary:`Pozvánky nájemníkům: ${invited} vytvořeno, ${waiting} čeká na začátek, ${skipped} přeskočeno, ${failed} chyb.`};
}
