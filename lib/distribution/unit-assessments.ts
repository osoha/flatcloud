import { UnitInvestmentUrgency, UnitQualityRating } from "@prisma/client";
import { canSeeAll } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const unitQualityRatings:Record<UnitQualityRating,string>={A_EXCELLENT:"A · Výborný stav",B_GOOD:"B · Dobrý stav",C_RENOVATE:"C · Vhodné k renovaci",D_MAJOR_WORK:"D · Zásadní investice"};
export const unitInvestmentUrgencies:Record<UnitInvestmentUrgency,string>={NONE:"Bez potřeby",MONITOR:"Sledovat",PLAN_12_MONTHS:"Naplánovat do 12 měsíců",IMMEDIATE:"Řešit ihned"};
export type AssessmentActor={id:string;role:string;allProperties?:boolean};

export async function createUnitAssetAssessment(actor:AssessmentActor,propertyId:string,unitId:string,input:{rating:UnitQualityRating;investmentUrgency:UnitInvestmentUrgency;estimatedCapexCents:number;distributionReady:boolean;assessedAt:Date;note?:string|null}){
  if(!canSeeAll(actor.role))throw new Error("Kategorizace jednotek je dostupná pouze interním správcům FlatCloud.");
  if(!Object.values(UnitQualityRating).includes(input.rating)||!Object.values(UnitInvestmentUrgency).includes(input.investmentUrgency))throw new Error("Vyberte platný rating a naléhavost investice.");
  if(!Number.isSafeInteger(input.estimatedCapexCents)||input.estimatedCapexCents<0)throw new Error("Odhad CAPEX nesmí být záporný.");
  if(Number.isNaN(input.assessedAt.getTime())||input.assessedAt.getTime()>Date.now()+86_400_000)throw new Error("Datum hodnocení nesmí být v budoucnosti.");
  return prisma.$transaction(async(tx)=>{
    const unit=await tx.unit.findFirst({where:{id:unitId,propertyId,property:{active:true,flatcloudConsolidationBasisPoints:{gt:0}}},select:{id:true,propertyId:true}});
    if(!unit)throw new Error("Jednotka není součástí potvrzeného aktiva FlatCloud.");
    const assessment=await tx.unitAssetAssessment.create({data:{unitId,rating:input.rating,investmentUrgency:input.investmentUrgency,estimatedCapexCents:input.estimatedCapexCents,distributionReady:input.distributionReady,assessedAt:input.assessedAt,note:input.note||null,createdById:actor.id}});
    await tx.auditLog.create({data:{userId:actor.id,propertyId,action:"UNIT_ASSET_ASSESSMENT_CREATED",entityType:"UnitAssetAssessment",entityId:assessment.id,details:{unitId,rating:input.rating,investmentUrgency:input.investmentUrgency,estimatedCapexCents:input.estimatedCapexCents,distributionReady:input.distributionReady,assessedAt:input.assessedAt.toISOString()}}});
    return assessment;
  });
}
