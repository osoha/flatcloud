import bcrypt from "bcryptjs";
import { invitationToken } from "@/lib/invitations";
import { prisma } from "@/lib/db";
import { sendMail, escapeHtml } from "@/lib/email";
import { smtpConfiguration } from "@/lib/email";
import { redirectUrl } from "@/lib/redirect-url";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request:Request){
  if(process.env.PUBLIC_REGISTRATION_ENABLED!=="true")return goWithMessage(request,"/registrace","error","Registrace není zapnutá.");
  try{
    const form=await request.formData();
    const name=String(form.get("name")||"").trim(),email=String(form.get("email")||"").trim().toLowerCase(),password=String(form.get("password")||"");
    if(!name||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||password.length<12||password.length>72)throw new Error("Zkontrolujte jméno, e-mail a délku hesla.");
    const mail=await smtpConfiguration();
    if(!mail.configured)throw new Error("Potvrzovací e-maily zatím nejsou nastavené.");
    if(!await prisma.user.findUnique({where:{email},select:{id:true}})){
      const recent=await prisma.registrationRequest.findUnique({where:{email},select:{createdAt:true}});
      if(!recent||recent.createdAt.getTime()<Date.now()-15*60_000){
        const globalCount=await prisma.registrationRequest.count({where:{createdAt:{gt:new Date(Date.now()-60*60_000)}}});
        if(globalCount>=300)throw new Error("Registrace je dočasně přetížená. Zkuste to později.");
        const {token,tokenHash}=invitationToken(),passwordHash=await bcrypt.hash(password,12);
        await prisma.registrationRequest.upsert({where:{email},create:{email,name,passwordHash,tokenHash,expiresAt:new Date(Date.now()+24*60*60_000)},update:{name,passwordHash,tokenHash,expiresAt:new Date(Date.now()+24*60*60_000),createdAt:new Date()}});
        const link=redirectUrl(`/registrace/potvrdit/${token}`,request).toString();
        try{
          const result=await sendMail({to:email,subject:"Potvrzení registrace FlatBerry",text:`Potvrďte registraci: ${link}\nOdkaz je platný 24 hodin. Pokud jste o registraci nežádali, e-mail ignorujte.`,html:`<p>Potvrďte registraci do FlatBerry.</p><p><a href="${escapeHtml(link)}">Potvrdit e-mail</a></p><p>Odkaz je platný 24 hodin. Pokud jste o registraci nežádali, e-mail ignorujte.</p>`});
          if(!result.sent)throw new Error("Potvrzovací e-mail se nepodařilo odeslat.");
        }catch{await prisma.registrationRequest.deleteMany({where:{email,tokenHash}});throw new Error("Potvrzovací e-mail se nepodařilo odeslat.")}
      }
    }
    return goWithMessage(request,"/registrace","ok","Potvrzovací odkaz byl připraven.");
  }catch(error){return goWithMessage(request,"/registrace","error",error instanceof Error?error.message:"Registrace se nepodařila.")}
}
