import { prisma } from "@/lib/db";
import { hasAllPropertyAccess } from "@/lib/auth";
import { guardKpiInputs } from "./kpi-completeness";
import { loadAssetFinanceKpis } from "./asset-finance-kpis";
import type { loadLiveReport } from "./live-service";
/** Operational ownership scope only. FlatCloud consolidation is not used here. */
export async function loadGeneralKpis(user:{id:string;role:string;allProperties?:boolean}, data:Awaited<ReturnType<typeof loadLiveReport>>, asOf:Date, unitId?:string) {
  const permitted=new Set(data.memberships.map(row=>row.propertyId));
  const rows=unitId?[]:data.propertyRows.filter(row=>hasAllPropertyAccess(user)||permitted.has(row.property.id));
  const finance=await loadAssetFinanceKpis(rows.map(row=>({...row,property:{...row.property,flatcloudConsolidationBasisPoints:10000}})),asOf);
  const missingLoans=await prisma.propertyLoan.findMany({where:{propertyId:{in:rows.map(r=>r.property.id)},active:true,snapshots:{none:{asOfDate:{lte:asOf}}}},select:{propertyId:true}});
  const missing=new Set(missingLoans.map(loan=>loan.propertyId));
  const missingRent = new Set(rows.filter(row => row.rentRoll.monthlyNetRentCents === null || row.units.unknownOperationalStatus > 0 || row.quality.some(issue => issue.code === "MISSING_RENT_SOURCE")).map(row => row.property.id));
  const propertyRows = finance.propertyRows.map(row => guardKpiInputs(row, !missingRent.has(row.propertyId), !missing.has(row.propertyId)));
  return {...guardKpiInputs(finance, missingRent.size === 0, missing.size === 0), propertyRows};
}
