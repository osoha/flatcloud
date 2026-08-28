import { prisma } from "../db";
import { calculatePropertySnapshot } from "./snapshot-calculator";
import { quarterSnapshotDataSchema, quarterSnapshotQualitySchema } from "./snapshot-schema";
export const SNAPSHOT_CALCULATOR_VERSION="v1";
export async function calculateAndStoreSnapshot(input:{propertyId:string;asOf:Date;createdById?:string}){
 const units=await prisma.unit.findMany({where:{propertyId:input.propertyId},include:{operationalStatusEvents:{orderBy:[{effectiveAt:"asc"},{createdAt:"asc"}]},leases:{include:{paymentItems:true,charges:{include:{items:true,allocations:{include:{transaction:true}},securityDepositOffsets:true,creditApplications:true}},securityDepositTerms:true,securityDepositMovements:true}}}});
 const result=calculatePropertySnapshot({propertyId:input.propertyId,asOf:input.asOf,units});quarterSnapshotDataSchema.parse(result.data);quarterSnapshotQualitySchema.parse(result.quality);const q=Math.floor(input.asOf.getUTCMonth()/3)+1,year=input.asOf.getUTCFullYear();return prisma.$transaction(async tx=>{const latest=await tx.quarterSnapshot.findFirst({where:{propertyId:input.propertyId,asOfDate:input.asOf},orderBy:{revision:"desc"},select:{revision:true}});return tx.quarterSnapshot.create({data:{propertyId:input.propertyId,asOfDate:input.asOf,year,quarter:q,revision:(latest?.revision||0)+1,source:"CALCULATED",schemaVersion:1,calculatorVersion:SNAPSHOT_CALCULATOR_VERSION,data:result.data,quality:result.quality,createdById:input.createdById}})});
}
