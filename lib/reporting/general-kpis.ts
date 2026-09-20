import { prisma } from "@/lib/db";
import { hasAllPropertyAccess } from "@/lib/auth";
import { loadAssetFinanceKpis } from "./asset-finance-kpis";
import type { loadLiveReport } from "./live-service";
/** Operational ownership scope only. FlatCloud consolidation is not used here. */
export async function loadGeneralKpis(user:{id:string;role:string;allProperties?:boolean}, data:Awaited<ReturnType<typeof loadLiveReport>>, asOf:Date, unitId?:string) {
  const permitted=new Set(data.memberships.map(row=>row.propertyId));
  const rows=unitId?[]:data.propertyRows.filter(row=>hasAllPropertyAccess(user)||permitted.has(row.property.id));
  const finance=await loadAssetFinanceKpis(rows.map(row=>({...row,property:{...row.property,flatcloudConsolidationBasisPoints:10000}})),asOf);
  const missingLoans=await prisma.propertyLoan.findMany({where:{propertyId:{in:rows.map(r=>r.property.id)},active:true,snapshots:{none:{asOfDate:{lte:asOf}}}},select:{propertyId:true}});
  const missing=new Set(missingLoans.map(loan=>loan.propertyId));
  const propertyRows=finance.propertyRows.map(row=>({...row,principalComplete:!missing.has(row.propertyId),roeBps:missing.has(row.propertyId)?null:row.roeBps,ltvBps:missing.has(row.propertyId)?null:row.ltvBps,dscrBps:missing.has(row.propertyId)?null:row.dscrBps,cashflowCents:missing.has(row.propertyId)?null:row.cashflowCents}));
  return {...finance,propertyRows,principalComplete:missing.size===0,roeBps:missing.size?null:finance.roeBps,ltvBps:missing.size?null:finance.ltvBps,dscrBps:missing.size?null:finance.dscrBps,cashflowCents:missing.size?null:finance.cashflowCents};
}
