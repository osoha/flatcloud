import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { buildContract, CONTRACT_TEMPLATE_VERSION } from "@/lib/lease-contracts/core";
import { contractActor, contractLease, archiveContract } from "@/lib/lease-contracts/service";
import { contractPdf } from "@/lib/lease-contracts/pdf";
import { portalEntryUrl } from "@/lib/tenant-portal-entry-pdf";
import { guideOriginMatches } from "@/lib/guide-origin";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{leaseId:string}>}) {
  if(!guideOriginMatches(request))return NextResponse.json({error:"Požadavek musí být odeslán z aplikace."},{status:403});
  const actor=await contractActor();if(!actor)return NextResponse.json({error:"Příprava smlouvy vyžaduje oprávnění k úpravě jednotky."},{status:403});
  const {leaseId}=await params,lease=await contractLease(actor,leaseId);if(!lease)return NextResponse.json({error:"Smlouva není dostupná pro úpravy."},{status:404});
  if(lease.unit.type!=="APARTMENT"||lease.currency!=="CZK"||[lease.tenant,...lease.parties.map(p=>p.tenant)].some(t=>t.type==="COMPANY"))return NextResponse.json({error:"Tento vzor je určen pro nájem bytu fyzickým osobám v Kč. Jiný účel nebo firemní nájemce vyžadují samostatný vzor."},{status:422});
  if(Number(request.headers.get("content-length")||0)>64000)return NextResponse.json({error:"Formulář je příliš rozsáhlý."},{status:413});
  try {
    const body=await request.text();if(body.length>64000)return NextResponse.json({error:"Formulář je příliš rozsáhlý."},{status:413});
    const data=JSON.parse(body) as {input:unknown;mode:string;version:string};
    if(data.version!==CONTRACT_TEMPLATE_VERSION)return NextResponse.json({error:"Vzor se změnil. Obnovte stránku a zkontrolujte nový náhled."},{status:409});
    if(!["preview","pdf","save"].includes(data.mode))return NextResponse.json({error:"Neplatná operace."},{status:400});
    const contract=buildContract(data.input);
    if(data.mode==="preview")return NextResponse.json({contract},{headers:{"Cache-Control":"private, no-store"}});
    const bytes=await contractPdf(contract.input,data.mode==="pdf",portalEntryUrl(lease.tenantId));
    if(data.mode==="pdf")return new Response(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=flatberry-najemni-smlouva-nahled.pdf","Cache-Control":"private, no-store"}});
    // This creates a fresh private file. Existing and signed originals are never rewritten.
    const document=await archiveContract(actor,lease,contract,bytes);
    return NextResponse.json({documentId:document.id,downloadUrl:`/api/documents/${document.id}/download`,returnUrl:`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unitId}#dokumenty`});
  }catch(error){
    if(error instanceof ZodError)return NextResponse.json({error:"Doplňte nebo opravte údaje před vytvořením smlouvy.",issues:error.issues.map(i=>({path:i.path.join("."),message:i.code==="custom"?i.message:i.path[0]==="confirmed"?"Potvrďte kontrolu smluvních údajů.":"Doplňte platnou hodnotu; povinné údaje nemohou zůstat prázdné."}))},{status:422});
    if(error instanceof SyntaxError)return NextResponse.json({error:"Formulář se nepodařilo načíst."},{status:400});
    console.error("Contract generation failed",{leaseId,error});return NextResponse.json({error:"Smlouvu se nepodařilo vytvořit. Zadané údaje zůstávají ve formuláři."},{status:503});
  }
}
