import { prisma } from "../db";
import { quarterSnapshotDataSchema, type QuarterSnapshotData } from "./snapshot-schema";
import type { PresentationTrendPoint } from "./presentation/quarterly-property-presentation-model";

export function snapshotTrendPoint(year:number,quarter:number,raw:unknown):PresentationTrendPoint|null{
  const parsed=quarterSnapshotDataSchema.safeParse(raw);if(!parsed.success)return null;const data:QuarterSnapshotData=parsed.data;
  const explicit=data.source==="MANUAL_BASELINE"&&data.schemaVersion===2?data.units?.occupancyBps:undefined;
  const occupied=data.units?.occupied,rentable=data.units?.rentable;
  const point={label:`Q${quarter} ${year}`,occupancyPercent:explicit!==undefined?explicit/100:typeof occupied==="number"&&typeof rentable==="number"&&rentable>0?occupied/rentable*100:null,monthlyNetRentCents:data.rentRoll?.monthlyNetRentCents??null,weightedNetRentPerM2Cents:data.rentRoll?.weightedNetRentPerM2Cents??null,collectionRatePercent:data.collections?.collectionRateBps==null?null:data.collections.collectionRateBps/100,overdueDebtCents:data.collections?.overdueDebtCents??null};
  return [point.occupancyPercent,point.monthlyNetRentCents,point.weightedNetRentPerM2Cents,point.collectionRatePercent,point.overdueDebtCents].every(value=>value===null)?null:point;
}
const periodKey=(year:number,quarter:number)=>year*4+quarter;
export async function resolveQuarterlyPropertyTrendSeries(input:{propertyId:string;targetReport:{id:string;year:number;quarter:number;status:string;publishedAt:Date|null};currentSnapshot:{data:unknown}}){
  const cutoff=input.targetReport.status==="PUBLISHED"?input.targetReport.publishedAt:null;const maxPeriod=periodKey(input.targetReport.year,input.targetReport.quarter);
  const [published,manual]=await Promise.all([
    prisma.quarterlyPropertyReport.findMany({where:{propertyId:input.propertyId,quarterlyReport:{status:"PUBLISHED",...(cutoff?{publishedAt:{lte:cutoff}}:{}),OR:[{year:{lt:input.targetReport.year}},{year:input.targetReport.year,quarter:{lte:input.targetReport.quarter}}]}},select:{snapshot:{select:{data:true}},quarterlyReport:{select:{id:true,year:true,quarter:true,revision:true,publishedAt:true}}},orderBy:[{quarterlyReport:{publishedAt:"desc"}},{quarterlyReport:{revision:"desc"}}]}),
    prisma.quarterSnapshot.findMany({where:{propertyId:input.propertyId,source:"MANUAL_BASELINE",...(cutoff?{createdAt:{lte:cutoff}}:{}),OR:[{year:{lt:input.targetReport.year}},{year:input.targetReport.year,quarter:{lte:input.targetReport.quarter}}]},select:{year:true,quarter:true,revision:true,data:true},orderBy:[{revision:"desc"}]})]);
  const periods=new Map<number,PresentationTrendPoint>();
  for(const row of manual){const key=periodKey(row.year,row.quarter);if(key<=maxPeriod&&!periods.has(key)){const point=snapshotTrendPoint(row.year,row.quarter,row.data);if(point)periods.set(key,point);}}
  const publishedPeriods=new Set<number>();for(const row of published){const {year,quarter}=row.quarterlyReport;const key=periodKey(year,quarter);if(key<=maxPeriod&&!publishedPeriods.has(key)){publishedPeriods.add(key);const point=snapshotTrendPoint(year,quarter,row.snapshot.data);if(point)periods.set(key,point);else periods.delete(key);}}
  const current=snapshotTrendPoint(input.targetReport.year,input.targetReport.quarter,input.currentSnapshot.data);const currentKey=periodKey(input.targetReport.year,input.targetReport.quarter);if(current)periods.set(currentKey,current);else periods.delete(currentKey);
  return [...periods.entries()].sort(([a],[b])=>a-b).slice(-6).map(([,point])=>point);
}
