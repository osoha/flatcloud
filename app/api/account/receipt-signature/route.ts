import sharp from "sharp";
import {currentUser} from "@/lib/auth";
import {portalEditableUnitWhere} from "@/lib/tenant-portal-access";
import {prisma} from "@/lib/db";
import {goWithMessage} from "@/lib/route-response";
export const runtime="nodejs";
export async function GET() {
  const user=await currentUser();if(!user)return new Response("Not found",{status:404});
  const row=await prisma.user.findUnique({where:{id:user.id},select:{receiptSignatureData:true}});
  return row?.receiptSignatureData?new Response(new Uint8Array(row.receiptSignatureData),{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store"}}):new Response("Not found",{status:404});
}
export async function POST(request:Request) {
  const user=await currentUser();if(!user)return new Response("Forbidden",{status:403});
  if(user.role==="TENANT"||!await prisma.unit.count({where:portalEditableUnitWhere(user)}))return new Response("Forbidden",{status:403});
  try {
    const form=await request.formData(),remove=form.get("removeSignature")==="on";
    const name=String(form.get("issuerName")||"").trim(),address=String(form.get("issuerAddress")||"").trim();
    if(!name||name.length>160||!address||address.length>240)throw new Error("Vyplňte jméno a adresu vystavitele.");
    let source:Buffer|undefined;const file=form.get("signature"),drawn=String(form.get("drawnSignature")||"");
    if(!remove&&drawn){if(drawn.length>2800000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(drawn))throw new Error("Neplatný obrázek podpisu.");source=Buffer.from(drawn.split(",")[1],"base64");}
    else if(!remove&&file instanceof File&&file.size){if(file.size>2*1024*1024)throw new Error("Podpis může mít nejvýše 2 MB.");source=Buffer.from(await file.arrayBuffer());}
    let signature:Buffer|undefined;
    if(source){const image=sharp(source,{limitInputPixels:12000000}),meta=await image.metadata();if(!["png","jpeg","webp"].includes(meta.format||""))throw new Error("Podpis musí být PNG, JPG nebo WebP.");const stats=await sharp(source).flatten({background:"white"}).greyscale().stats();if(stats.channels[0].min>200||stats.channels[0].stdev<1)throw new Error("Obrázek neobsahuje čitelný podpis.");signature=await image.rotate().resize({width:900,height:300,fit:"inside",withoutEnlargement:true}).png().toBuffer();}
    const existing=await prisma.user.findUniqueOrThrow({where:{id:user.id},select:{receiptSignatureData:true}});
    const enabled=!remove&&form.get("issuanceEnabled")==="on";
    if(enabled&&!signature&&!existing.receiptSignatureData)throw new Error("Před povolením vystavování nakreslete nebo nahrajte podpis.");
    await prisma.$transaction([prisma.user.update({where:{id:user.id},data:{receiptIssuerName:name,receiptIssuerAddress:address,receiptIssuanceEnabled:enabled,...(remove?{receiptSignatureData:null}:signature?{receiptSignatureData:new Uint8Array(signature)}:{})}}),prisma.auditLog.create({data:{userId:user.id,action:"RECEIPT_SIGNATURE_CONFIGURED",entityType:"User",entityId:user.id,details:{enabled,signatureChanged:Boolean(source)||remove}}})]);
    return goWithMessage(request,"/ucet#podpis","ok","Nastavení podpisu bylo uloženo.");
  }catch(error){return goWithMessage(request,"/ucet#podpis","error",error instanceof Error?error.message:"Podpis se nepodařilo uložit.");}
}
