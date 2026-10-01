import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { redirectUrl } from "@/lib/redirect-url";
import { hashPasswordResetToken, resetTokenPattern } from "@/lib/self-service-password-reset";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request:Request) {
  const form=await request.formData();
  const token=String(form.get("token")||"");
  const password=String(form.get("password")||"");
  const confirmation=String(form.get("confirmation")||"");
  const invalid=()=>Response.redirect(redirectUrl("/zapomenute-heslo?sent=1",request),303);
  if(!resetTokenPattern.test(token))return invalid();
  if(password.length<12||password.length>72||password!==confirmation)return Response.redirect(redirectUrl(`/obnovit-heslo/${token}?error=1`,request),303);
  const tokenHash=hashPasswordResetToken(token);
  const passwordHash=await bcrypt.hash(password,12);
  try {
    await serializableTransaction(async tx=>{
      const reset=await tx.passwordResetToken.findUnique({where:{tokenHash},include:{user:{select:{active:true}}}});
      const now=new Date();
      if(!reset||reset.usedAt||reset.expiresAt<=now||!reset.user.active)throw new Error("invalid reset");
      const claimed=await tx.passwordResetToken.updateMany({where:{id:reset.id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}});
      if(claimed.count!==1)throw new Error("stale reset");
      await tx.user.update({where:{id:reset.userId},data:{passwordHash,sessionVersion:{increment:1}}});
      await tx.passwordResetToken.updateMany({where:{userId:reset.userId,usedAt:null},data:{usedAt:now}});
      await tx.auditLog.create({data:{userId:reset.userId,action:"USER_PASSWORD_SELF_RESET",entityType:"User",entityId:reset.userId,details:{sessionsRevoked:true}}});
    });
    return Response.redirect(redirectUrl("/login?reset=1",request),303);
  }catch{return invalid();}
}
