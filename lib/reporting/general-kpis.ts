import { prisma } from "@/lib/db";
import { hasAllPropertyAccess } from "@/lib/auth";
import { guardKpiInputs } from "./kpi-completeness";
import { loadAssetFinanceKpis } from "./asset-finance-kpis";
import type { loadLiveReport } from "./live-service";
import { loadPortfolioSaleBenchmarks } from "./sale-benchmark";
function ratioBps(numerator:number|null,denominator:number|null){return numerator==null||denominator==null||denominator<=0?null:Math.round(numerator*10_000/denominator)}
/** Operational ownership scope only. FlatCloud consolidation is not used here. */
export async function loadGeneralKpis(user:{id:string;role:string;allProperties?:boolean}, data:Awaited<ReturnType<typeof loadLiveReport>>, asOf:Date, unitId?:string) {
  const permitted=new Set(data.memberships.map(row=>row.propertyId));
  const rows=unitId?[]:data.propertyRows.filter(row=>hasAllPropertyAccess(user)||permitted.has(row.property.id));
  const propertyIds=rows.map(row=>row.property.id);
  const [finance,missingLoans,benchmarks]=await Promise.all([loadAssetFinanceKpis(rows.map(row=>({...row,property:{...row.property,flatcloudConsolidationBasisPoints:10000}})),asOf),prisma.propertyLoan.findMany({where:{propertyId:{in:propertyIds},active:true,snapshots:{none:{asOfDate:{lte:asOf}}}},select:{propertyId:true}}),loadPortfolioSaleBenchmarks(propertyIds)]);
  const missing=new Set(missingLoans.map(loan=>loan.propertyId));
  const missingRent = new Set(rows.filter(row => row.rentRoll.monthlyNetRentCents === null || row.units.unknownOperationalStatus > 0 || row.quality.some(issue => issue.code === "MISSING_RENT_SOURCE")).map(row => row.property.id));
  const benchmarkByProperty=new Map(benchmarks.map(row=>[row.propertyId,row]));
  const propertyRows = finance.propertyRows.map(row => {const guarded=guardKpiInputs(row,!missingRent.has(row.propertyId),!missing.has(row.propertyId)),benchmark=benchmarkByProperty.get(row.propertyId),benchmarkValueCents=benchmark?.benchmarkValueCents??null,benchmarkEquityCents=benchmarkValueCents==null||guarded.outstandingPrincipalCents==null?null:benchmarkValueCents-guarded.outstandingPrincipalCents;return {...guarded,benchmarkValueCents,benchmarkYieldBps:ratioBps(guarded.noiCents,benchmarkValueCents),benchmarkRoeBps:ratioBps(guarded.cashflowCents,benchmarkEquityCents),benchmarkLtvBps:ratioBps(guarded.outstandingPrincipalCents,benchmarkValueCents),benchmarkQoqBps:benchmark?.qoqBps??null,benchmarkConfidence:benchmark?.realized?.confidence??null,benchmarkQuarter:benchmark?.realized?`${benchmark.realized.marketYear} Q${benchmark.realized.marketQuarter}`:null,benchmarkCoveredUnits:benchmark?.coveredUnits??0,benchmarkTotalUnits:benchmark?.totalUnits??0};});
  const guarded=guardKpiInputs(finance,missingRent.size===0,missing.size===0),benchmarkComplete=propertyRows.length>0&&propertyRows.every(row=>row.benchmarkValueCents!=null),benchmarkValueCents=benchmarkComplete?propertyRows.reduce((sum,row)=>sum+row.benchmarkValueCents!,0):null,benchmarkEquityCents=benchmarkValueCents==null||guarded.outstandingPrincipalCents==null?null:benchmarkValueCents-guarded.outstandingPrincipalCents;
  return {...guarded,propertyRows,benchmarkValueCents,benchmarkYieldBps:ratioBps(guarded.noiCents,benchmarkValueCents),benchmarkRoeBps:ratioBps(guarded.cashflowCents,benchmarkEquityCents),benchmarkLtvBps:ratioBps(guarded.outstandingPrincipalCents,benchmarkValueCents),benchmarkCoverageCount:propertyRows.filter(row=>row.benchmarkValueCents!=null).length,benchmarkComplete};
}
