import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { businessDateKeyToInstant, quarterEndKey } from "../calendar";
import { serializableTransaction } from "../serializable";
import { nextSnapshotRevision, validateSnapshotPeriod } from "./invariants";
import { MANUAL_BASELINE_SCHEMA_VERSION, manualBaselineSnapshotDataSchema, quarterSnapshotQualitySchema } from "./snapshot-schema";

const REVISION_RETRIES = 3;
export const MANUAL_BASELINE_CALCULATOR_VERSION = "manual-baseline-v2";
export type HistoricalQuarterKpis = { occupancyBps?:number; monthlyNetRentCents?:number; weightedNetRentPerM2Cents?:number; collectionRateBps?:number; overdueDebtCents?:number };
export type CreateManualBaselineInput = { propertyId:string; year:number; quarter:number; sourceNote:string; createdById:string; kpis:HistoricalQuarterKpis };

export async function createManualBaselineSnapshotTx(tx:Prisma.TransactionClient,input:CreateManualBaselineInput){
  if(!Number.isInteger(input.year)||input.year<1900||input.year>2200)throw new Error("Neplatný rok.");
  if(!Number.isInteger(input.quarter)||input.quarter<1||input.quarter>4)throw new Error("Neplatné čtvrtletí.");
  const sourceNote=input.sourceNote.trim();if(!sourceNote||sourceNote.length>500)throw new Error("Zdroj / poznámka je povinná (max. 500 znaků).");
  const known=Object.entries(input.kpis).filter(([,value])=>value!==undefined);
  if(!known.length)throw new Error("Vyplňte alespoň jeden známý ukazatel.");
  for(const [key,value] of known){if(!Number.isSafeInteger(value)||value<0)throw new Error(`Neplatná hodnota ${key}.`);}
  for(const key of ["occupancyBps","collectionRateBps"] as const){const value=input.kpis[key];if(value!==undefined&&value>10000)throw new Error("Procento musí být mezi 0 a 100.");}
  const asOfKey=quarterEndKey(input.year,input.quarter);const asOfDate=businessDateKeyToInstant(asOfKey);
  const data={source:"MANUAL_BASELINE" as const,schemaVersion:MANUAL_BASELINE_SCHEMA_VERSION,asOfDate:asOfKey,
    ...(input.kpis.occupancyBps!==undefined?{units:{occupancyBps:input.kpis.occupancyBps}}:{}),
    ...(input.kpis.monthlyNetRentCents!==undefined||input.kpis.weightedNetRentPerM2Cents!==undefined?{rentRoll:{...(input.kpis.monthlyNetRentCents!==undefined?{monthlyNetRentCents:input.kpis.monthlyNetRentCents}:{}),...(input.kpis.weightedNetRentPerM2Cents!==undefined?{weightedNetRentPerM2Cents:input.kpis.weightedNetRentPerM2Cents}:{})}}:{}),
    ...(input.kpis.collectionRateBps!==undefined||input.kpis.overdueDebtCents!==undefined?{collections:{...(input.kpis.collectionRateBps!==undefined?{collectionRateBps:input.kpis.collectionRateBps}:{}),...(input.kpis.overdueDebtCents!==undefined?{overdueDebtCents:input.kpis.overdueDebtCents}:{})}}:{})};
  manualBaselineSnapshotDataSchema.parse(data);const quality=quarterSnapshotQualitySchema.parse({issues:[]});
  const latest=await tx.quarterSnapshot.findFirst({where:{propertyId:input.propertyId,asOfDate},orderBy:{revision:"desc"},select:{revision:true}});
  const revision=nextSnapshotRevision(latest?.revision);validateSnapshotPeriod({asOfDate,year:input.year,quarter:input.quarter,revision});
  const snapshot=await tx.quarterSnapshot.create({data:{propertyId:input.propertyId,asOfDate,year:input.year,quarter:input.quarter,revision,source:"MANUAL_BASELINE",schemaVersion:MANUAL_BASELINE_SCHEMA_VERSION,calculatorVersion:MANUAL_BASELINE_CALCULATOR_VERSION,data,quality,sourceNote,createdById:input.createdById}});
  await tx.auditLog.create({data:{userId:input.createdById,propertyId:input.propertyId,action:"REPORTING_MANUAL_BASELINE_CREATED",entityType:"QuarterSnapshot",entityId:snapshot.id,details:{year:input.year,quarter:input.quarter,revision,knownKpis:known.map(([key])=>key)}}});
  return snapshot;
}
export async function createManualBaselineSnapshot(input:CreateManualBaselineInput){for(let attempt=0;;attempt++){try{return await serializableTransaction(tx=>createManualBaselineSnapshotTx(tx,input));}catch(error){const collision=error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002";if(!collision||attempt>=REVISION_RETRIES)throw error;}}}
