import { prisma } from "@/lib/db";
import { sendMail, escapeHtml, smtpConfiguration } from "@/lib/email";
import { redirectUrl } from "@/lib/redirect-url";
import { newPasswordResetToken, resetLifetimeMs } from "@/lib/self-service-password-reset";

export async function POST(request:Request) {
  const form=await request.formData();
  const email=String(form.get("email")||"").trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return Response.redirect(redirectUrl("/zapomenute-heslo?error=1",request),303);
  const reply=()=>Response.redirect(redirectUrl("/zapomenute-heslo?sent=1",request),303);
  try {
    // Helltest data must never send mail to a real address.
    if(process.env.RENDER_GIT_BRANCH?.startsWith("sandbox/")||process.env.RENDER_EXTERNAL_URL?.includes("sandbox"))return reply();
    const user=await prisma.user.findUnique({where:{email},select:{id:true,active:true,isTestIdentity:true}});
    if(!user?.active||user.isTestIdentity||/\.(test|invalid)$/.test(email))return reply();
    const now=new Date();
    const [recent,globalCount,mail]=await Promise.all([
      prisma.passwordResetToken.findMany({where:{userId:user.id,createdAt:{gt:new Date(now.getTime()-60*60_000)}},select:{createdAt:true},orderBy:{createdAt:"desc"},take:3}),
      prisma.passwordResetToken.count({where:{createdAt:{gt:new Date(now.getTime()-60*60_000)}}}),
      smtpConfiguration(),
    ]);
    if(!mail.configured||recent.length>=3||globalCount>=300||(recent[0]&&recent[0].createdAt.getTime()>now.getTime()-15*60_000))return reply();
    const {token,tokenHash}=newPasswordResetToken();
    await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash,expiresAt:new Date(now.getTime()+resetLifetimeMs)}});
    const link=redirectUrl(`/obnovit-heslo/${token}`,request).toString();
    const home=redirectUrl("/",request).toString(),login=redirectUrl("/login",request).toString();
    try {
      const result=await sendMail({to:email,subject:"Obnova hesla FlatBerry",text:`Obnovit heslo: ${link}\nOdkaz platí 30 minut a lze jej použít jen jednou. Pokud jste obnovu nežádali, zprávu ignorujte.\nPřihlášení: ${login}\nVeřejný web: ${home}`,html:`<div style="font-family:Arial,sans-serif;line-height:1.55"><h2>Obnova hesla FlatBerry</h2><p><a href="${escapeHtml(link)}">Nastavit nové heslo</a></p><p>Odkaz platí 30 minut a lze jej použít jen jednou. Pokud jste obnovu nežádali, zprávu ignorujte.</p><p><a href="${escapeHtml(login)}">Přihlášení</a> · <a href="${escapeHtml(home)}">Veřejný web</a></p></div>`});
      if(!result.sent)await prisma.passwordResetToken.deleteMany({where:{tokenHash,usedAt:null}});
    } catch {
      await prisma.passwordResetToken.deleteMany({where:{tokenHash,usedAt:null}});
    }
  } catch {
    // Neither account existence nor mail configuration is disclosed.
  }
  return reply();
}
