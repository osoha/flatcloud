import { PersonalValueKind } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { requireUnitAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { parseCzkToCents } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{id:string;unitId:string}>}) {
  const user=await currentUser();if(!user)return go(request,"/login");
  const {id,unitId}=await params,returnTo=`/nemovitosti/${id}/jednotky/${unitId}#osobni-hodnota`;
  if(!await requireUnitAccess(user,id,unitId))return go(request,"/portfolio");
  try {
    const form=await request.formData();
    const kind=form.get("kind");
    if(kind!==PersonalValueKind.LOCAL_MARKET_REFERENCE&&kind!==PersonalValueKind.OFFICIAL_APPRAISAL)throw new Error("Vyberte typ podkladu.");
    const date=(key:string,required=false)=>{
      const raw=String(form.get(key)||"").trim();if(!raw&&!required)return null;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw new Error(`Datum ${key} není platné.`);
      const value=new Date(`${raw}T12:00:00.000Z`);
      if(Number.isNaN(value.getTime())||value.toISOString().slice(0,10)!==raw||value.getTime()>Date.now()+86_400_000)throw new Error(`Datum ${key} není platné.`);
      return value;
    };
    const asOfDate=date("asOfDate",true)!;
    const sourceName=String(form.get("sourceName")||"").trim(),reference=String(form.get("reference")||"").trim(),note=String(form.get("note")||"").trim();
    if(!sourceName||sourceName.length>120||reference.length>200||note.length>1000)throw new Error("Doplňte přiměřeně dlouhý název zdroje a podkladu.");
    const urlText=String(form.get("sourceUrl")||"").trim();let sourceUrl:string|null=null;
    if(urlText){const url=new URL(urlText);if(url.protocol!=="https:"||urlText.length>1000)throw new Error("Zdrojový odkaz musí používat HTTPS.");sourceUrl=url.toString()}
    const countText=String(form.get("transactionCount")||"").trim();
    const transactionCount=countText===""?null:Number(countText);
    if(transactionCount!==null&&(!Number.isSafeInteger(transactionCount)||transactionCount<0||transactionCount>1_000_000))throw new Error("Počet transakcí není platný.");
    const windowFrom=date("windowFrom"),windowTo=date("windowTo");
    if(kind===PersonalValueKind.LOCAL_MARKET_REFERENCE&&(!windowFrom||!windowTo||windowFrom>windowTo||windowTo>asOfDate))throw new Error("U místního údaje uveďte skutečné zdrojové období končící nejpozději dnem odečtu.");
    let pricePerSqmCents:number|null=null,valueCents:number;
    if(kind===PersonalValueKind.LOCAL_MARKET_REFERENCE){
      const unit=await prisma.unit.findUnique({where:{id:unitId},select:{areaM2:true}});
      if(!unit?.areaM2||unit.areaM2<=0)throw new Error("Pro místní cenu za m² nejprve doplňte plochu jednotky.");
      pricePerSqmCents=parseCzkToCents(String(form.get("pricePerSqmCzk")||""));
      valueCents=Math.round(pricePerSqmCents*unit.areaM2);
    }else{
      valueCents=parseCzkToCents(String(form.get("valueCzk")||""));
      if(!reference)throw new Error("Doplňte identifikaci bankovního nebo odborného ocenění.");
    }
    if(!Number.isSafeInteger(valueCents)||valueCents<=0)throw new Error("Hodnota musí být kladná a v bezpečném rozsahu.");
    const result=await prisma.personalValueCheckpoint.create({data:{userId:user.id,unitId,kind,valueCents:BigInt(valueCents),pricePerSqmCents:pricePerSqmCents==null?null:BigInt(pricePerSqmCents),asOfDate,windowFrom:kind===PersonalValueKind.LOCAL_MARKET_REFERENCE?windowFrom:null,windowTo:kind===PersonalValueKind.LOCAL_MARKET_REFERENCE?windowTo:null,transactionCount:kind===PersonalValueKind.LOCAL_MARKET_REFERENCE?transactionCount:null,sourceName,sourceUrl,reference:reference||null,note:note||null}});
    // Keep personal appraisal metadata out of the property's shared activity feed.
    await prisma.auditLog.create({data:{userId:user.id,action:"PERSONAL_VALUE_CHECKPOINT_CREATED",entityType:"PersonalValueCheckpoint",entityId:result.id,details:{kind}}});
    return goWithMessage(request,returnTo,"ok","Osobní hodnota byla uložena jako nový datovaný stav.");
  }catch(error){return goWithMessage(request,returnTo,"error",error instanceof Error?error.message:"Hodnotu se nepodařilo uložit.")}
}
