import { UnitValuationSource } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { createUnitValuationSnapshot } from "@/lib/distribution/unit-valuations";
import { calculateSaleBenchmarkValue, saleBenchmarkConfidenceLabels, saleBenchmarkSources } from "@/lib/reporting/sale-benchmark";
import { go, goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return go(request,"/login");const{id}=await params;
  try{
    const form=await request.formData();if(form.get("confirm")!=="on")throw new Error("Potvrďte převzetí orientačního benchmarku do historie valuace.");
    const unitId=String(form.get("unitId")||""),snapshotId=String(form.get("snapshotId")||"");
    const label=await serializableTransaction(async tx=>{const [unit,snapshot,location]=await Promise.all([tx.unit.findFirst({where:{id:unitId,propertyId:id,type:"APARTMENT",operationalStatus:{not:"INACTIVE"}},select:{id:true,label:true,areaM2:true}}),tx.saleBenchmarkSnapshot.findFirst({where:{id:snapshotId,metric:"REALIZED_AVERAGE",mappingQuality:{not:"UNMAPPED"}}}),tx.propertyMfRentLocation.findUnique({where:{propertyId:id}})]);
      if(!unit||!snapshot||!location||snapshot.territoryCode!==location.territoryCode)throw new Error("Jednotka nebo benchmark neodpovídají aktuálnímu území nemovitosti.");
      const marketValueCents=calculateSaleBenchmarkValue(unit.areaM2,snapshot.pricePerSqmCents);if(!marketValueCents)throw new Error("Jednotka nemá použitelnou plochu pro výpočet benchmarku.");
      const reference=`P02D:${snapshot.id}`;const existing=await tx.unitValuationSnapshot.findFirst({where:{unitId,source:"MARKET_BENCHMARK",reference}});if(existing)throw new Error("Tento benchmark už byl pro jednotku potvrzen.");
      await createUnitValuationSnapshot(user,id,unitId,{marketValueCents,source:UnitValuationSource.MARKET_BENCHMARK,valuationDate:snapshot.windowTo,reference,note:`Orientační benchmark ${saleBenchmarkSources[snapshot.source]} · ${snapshot.cadastralName} · ${snapshot.marketYear} Q${snapshot.marketQuarter} · důvěra ${saleBenchmarkConfidenceLabels[snapshot.confidence]}. Nejde o znalecký posudek.`},tx);return unit.label});
    return goWithMessage(request,`/nemovitosti/${id}/nastaveni/reporting#prodejni-benchmark`,"ok",`Benchmark jednotky ${label} byl uložen jako nový historický stav valuace.`);
  }catch(error){return goWithMessage(request,`/nemovitosti/${id}/nastaveni/reporting#prodejni-benchmark`,"error",error instanceof Error?error.message:"Benchmark se nepodařilo potvrdit.")}
}
