import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request:Request) {
  const user=await currentUser();
  if(!user) return go(request,"/login");
  const value=(await request.formData()).get("graphics");
  if(value!=="true"&&value!=="false") return goWithMessage(request,"/ucet#vzhled","error","Vyberte způsob zobrazení.");
  await prisma.user.update({where:{id:user.id},data:{profiGraphics:value==="true"}});
  return goWithMessage(request,"/ucet#vzhled","ok","Vzhled prostředí byl uložen.");
}
