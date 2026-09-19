import {UnitValuationSource} from "@prisma/client";
import {canSeeAll} from "@/lib/auth";
import {prisma} from "@/lib/db";

export const unitValuationSources:Record<UnitValuationSource,string>={INTERNAL_COMPARABLES:"Interní srovnání",EXTERNAL_APPRAISAL:"Externí odhad",OFFER_PRICE:"Nabídková cena",TRANSACTION:"Realizovaná transakce"};
export async function createUnitValuationSnapshot(actor:{id:string;role:string;allProperties?:boolean},propertyId:string,unitId:string,input:{marketValueCents:number;source:UnitValuationSource;valuationDate:Date;reference?:string|null;note?:string|null}){
  if(!canSeeAll(actor.role))throw new Error("Valuace jednotek je dostupná pouze interním správcům FlatCloud.");
  if(!Number.isSafeInteger(input.marketValueCents)||input.marketValueCents<=0)throw new Error("Tržní hodnota musí být vyšší než nula.");
  if(!Object.values(UnitValuationSource).includes(input.source))throw new Error("Vyberte platný zdroj valuace.");
  if(Number.isNaN(input.valuationDate.getTime())||input.valuationDate.getTime()>Date.now()+86_400_000)throw new Error("Datum valuace nesmí být v budoucnosti.");
  return prisma.$transaction(async(tx)=>{const unit=await tx.unit.findFirst({where:{id:unitId,propertyId,property:{active:true,flatcloudConsolidationBasisPoints:{gt:0}}},select:{id:true}});if(!unit)throw new Error("Jednotka není součástí potvrzeného aktiva FlatCloud.");const valuation=await tx.unitValuationSnapshot.create({data:{unitId,marketValueCents:BigInt(input.marketValueCents),source:input.source,valuationDate:input.valuationDate,reference:input.reference||null,note:input.note||null,createdById:actor.id}});await tx.auditLog.create({data:{userId:actor.id,propertyId,action:"UNIT_VALUATION_SNAPSHOT_CREATED",entityType:"UnitValuationSnapshot",entityId:valuation.id,details:{unitId,marketValueCents:input.marketValueCents,source:input.source,valuationDate:input.valuationDate.toISOString(),reference:input.reference||null}}});return valuation});
}
