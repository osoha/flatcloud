import { prisma } from "@/lib/db";
import { hashInvitationToken } from "@/lib/invitations";
import { createSession } from "@/lib/auth";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request:Request){
  if(process.env.PUBLIC_REGISTRATION_ENABLED!=="true")return go(request,"/login");
  const form=await request.formData(),token=String(form.get("token")||"");
  if(!/^[a-zA-Z0-9_-]{30,100}$/.test(token))return go(request,"/registrace");
  const returnTo=`/registrace/potvrdit/${token}`;
  try{
    const tokenHash=hashInvitationToken(token);
    const result=await prisma.$transaction(async tx=>{
      const pending=await tx.registrationRequest.findUnique({where:{tokenHash}});
      if(!pending||pending.expiresAt.getTime()<Date.now())throw new Error("Odkaz vypršel nebo byl použit. Požádejte o nový.");
      if(await tx.user.findUnique({where:{email:pending.email},select:{id:true}}))throw new Error("Účet už existuje. Přihlaste se.");
      const user=await tx.user.create({data:{email:pending.email,name:pending.name,passwordHash:pending.passwordHash,role:"OWNER_VIEWER",allProperties:false},select:{id:true,sessionVersion:true}});
      await tx.owner.create({data:{userId:user.id,name:pending.name,email:pending.email,type:"PERSON",affiliation:"EXTERNAL"}});
      const claimed=await tx.registrationRequest.deleteMany({where:{id:pending.id,tokenHash,expiresAt:{gt:new Date()}}});
      if(claimed.count!==1)throw new Error("Odkaz už byl použit.");
      await tx.auditLog.create({data:{userId:user.id,action:"SELF_REGISTRATION_CONFIRMED",entityType:"User",entityId:user.id}});
      return user;
    });
    await createSession(result.id,result.sessionVersion);
    return goWithMessage(request,"/nemovitosti/nova","ok","E-mail byl potvrzen. Založte první dům.");
  }catch(error){return goWithMessage(request,returnTo,"error",error instanceof Error?error.message:"Potvrzení se nepodařilo.")}
}
