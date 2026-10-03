import {currentUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {invitationToken} from "@/lib/invitations";
import {sendTenantPortalInvitationEmail} from "@/lib/email";
import {redirectUrl} from "@/lib/redirect-url";
import {go,goWithMessage} from "@/lib/route-response";
import {sealSecret} from "@/lib/secret";

export async function POST(request:Request,{params}:{params:Promise<{tenantId:string}>}) {
  const actor=await currentUser();if(actor?.role!=="SUPER_ADMIN")return goWithMessage(request,"/login","error","Přístup byl odepřen.");
  const {tenantId}=await params;const path=`/najemnici/${tenantId}`;
  try {
    const tenant=await prisma.tenant.findUnique({where:{id:tenantId},select:{name:true,email:true,communicationEmail:true,leases:{select:{unit:{select:{propertyId:true}}},take:1},leaseParties:{select:{lease:{select:{unit:{select:{propertyId:true}}}}},take:1}}});
    if(!tenant)throw new Error("Nájemník nebyl nalezen.");
    const email=(tenant.communicationEmail||tenant.email||"").trim().toLowerCase();
    const propertyId=tenant.leases[0]?.unit.propertyId||tenant.leaseParties[0]?.lease.unit.propertyId;
    if(!propertyId||!/^\S+@\S+\.\S+$/.test(email))throw new Error("Nájemník potřebuje evidovaný e-mail a nájemní smlouvu.");
    const existing=await prisma.user.findUnique({where:{email},select:{id:true,active:true}});
    if(existing&&!existing.active)throw new Error("Účet s tímto e-mailem je deaktivovaný.");
    if(existing&&await prisma.tenantPortalAccess.findUnique({where:{userId_tenantId:{userId:existing.id,tenantId}}}))throw new Error("Tento účet už má přístup k portálu nájemníka.");
    const {token,tokenHash}=invitationToken();
    const invite=await prisma.$transaction(async tx=>{
      await tx.userInvitation.updateMany({where:{tenantId,status:"PENDING"},data:{status:"REVOKED"}});
      return tx.userInvitation.create({data:{email,name:tenant.name,tokenHash,tokenEncrypted:sealSecret(token),tenantId,propertyId,role:"TENANT",permission:"VIEW",invitedById:actor.id,expiresAt:new Date(Date.now()+7*86400000)}});
    });
    const inviteUrl=redirectUrl(`/pozvanka/${token}`,request).toString();
    const sandbox=process.env.RENDER_GIT_BRANCH?.startsWith("sandbox/")||process.env.RENDER_EXTERNAL_URL?.includes("sandbox");
    let result:{sent:boolean;reason?:string};
    try{result=sandbox?{sent:false,reason:"Sandbox: e-mail se neposílá."}:await sendTenantPortalInvitationEmail({to:email,inviterName:actor.name,inviteUrl});}
    catch(error){result={sent:false,reason:error instanceof Error?error.message:"E-mail se nepodařilo odeslat."};}
    await prisma.userInvitation.update({where:{id:invite.id},data:result.sent?{sentAt:new Date(),deliveryError:null}:{deliveryError:result.reason||"E-mail se nepodařilo odeslat."}});
    await prisma.auditLog.create({data:{userId:actor.id,propertyId,action:"TENANT_PORTAL_INVITED",entityType:"UserInvitation",entityId:invite.id,details:{tenantId,email,sent:result.sent}}});
    if(!result.sent)return go(request,`${path}?ok=${encodeURIComponent(sandbox?"Pozvánka byla připravena. V sandboxu se e-mail neodesílá.":"Pozvánka byla připravena, ale e-mail se nepodařilo odeslat. Předání odkazu je nutné ověřit.")}&invite=${encodeURIComponent(inviteUrl)}`);
    return goWithMessage(request,path,"ok",`Pozvánka byla odeslána na ${email}.`);
  }catch(error){return goWithMessage(request,path,"error",error instanceof Error?error.message:"Pozvánku se nepodařilo připravit.");}
}
