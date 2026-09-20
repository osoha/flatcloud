import { NextResponse } from "next/server";
import { actualUser, startUserPreview } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/management";
import { go } from "@/lib/route-response";
export async function POST(request: Request) {
  const actor = await actualUser();
  if (!actor) return NextResponse.json({error:"Přihlášení vypršelo."},{status:401});
  if (actor.role !== "SUPER_ADMIN") return NextResponse.json({error:"Přístup není povolen."},{status:403});
  if (request.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null,{status:403});
  const form = await request.formData();
  const target = await prisma.user.findFirst({where:{id:String(form.get("userId")||""),active:true},select:{id:true,sessionVersion:true}});
  if (!target || target.id === actor.id) return NextResponse.json({error:"Vyberte jiný aktivní účet."},{status:400});
  await audit(actor.id,"USER_PREVIEW_STARTED","User",target.id,{readOnly:true});
  await startUserPreview(actor,target);
  return go(request,"/portfolio");
}
