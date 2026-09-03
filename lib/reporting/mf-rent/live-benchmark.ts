import type { UnitDisposition } from "@prisma/client";
import type { ReportingQualityIssue } from "../data-quality";
import type { MfRentTerritoryData } from "./schema";

export type MfRentCategoryKey = "vk1" | "vk2" | "vk3" | "vk4";

export const mfRentCategoryLabels: Record<MfRentCategoryKey, string> = {
  vk1: "VK1 · studio, 1+kk, 1+1",
  vk2: "VK2 · 2+kk, 2+1",
  vk3: "VK3 · 3+kk, 3+1",
  vk4: "VK4 · 4+kk, 4+1",
};

export function dispositionToMfRentCategory(
  disposition: UnitDisposition | null | undefined,
): MfRentCategoryKey | null {
  if (disposition === "STUDIO" || disposition === "ONE_KK" || disposition === "ONE_PLUS_ONE") return "vk1";
  if (disposition === "TWO_KK" || disposition === "TWO_PLUS_ONE") return "vk2";
  if (disposition === "THREE_KK" || disposition === "THREE_PLUS_ONE") return "vk3";
  if (disposition === "FOUR_KK" || disposition === "FOUR_PLUS_ONE") return "vk4";
  return null;
}

type LiveUnit = {
  leaseId: string | null;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  unitType: string;
  benchmarkEligible: boolean;
  occupancyStatus: "OCCUPIED" | "VACANT";
  disposition: UnitDisposition | null;
  areaM2: number | null;
  actualRentPerM2Cents: number | null;
};

type PropertyBenchmark = {
  propertyId: string;
  territoryName: string;
  data: MfRentTerritoryData;
};

export function calculateLiveMfRentBenchmark(
  units: LiveUnit[],
  benchmarks: PropertyBenchmark[],
) {
  const byProperty = new Map(benchmarks.map((row) => [row.propertyId, row]));
  const comparableUnits = units.filter((unit) => unit.benchmarkEligible && unit.unitType === "APARTMENT" && unit.areaM2 != null && unit.areaM2 > 0);
  const rows = comparableUnits.flatMap((unit) => {
    const benchmark = byProperty.get(unit.propertyId);
    const category = dispositionToMfRentCategory(unit.disposition);
    const marketRentPerM2Cents = category && benchmark ? benchmark.data[category].referenceRentCentsPerM2 : null;
    if (!benchmark || !category || marketRentPerM2Cents == null || unit.actualRentPerM2Cents == null) return [];
    const areaM2 = unit.areaM2!;
    const actualRentPerM2Cents = unit.actualRentPerM2Cents;
    const marketGapPerM2Cents = marketRentPerM2Cents - actualRentPerM2Cents;
    return [{
      ...unit,
      areaM2,
      actualRentPerM2Cents,
      territoryName: benchmark.territoryName,
      category,
      marketRentPerM2Cents,
      rentToMarketBps: marketRentPerM2Cents === 0 ? null : Math.round(actualRentPerM2Cents * 10_000 / marketRentPerM2Cents),
      marketGapPerM2Cents,
      reversionaryPotentialCents: Math.round(marketGapPerM2Cents * areaM2),
      actualComparableRentCents: Math.round(actualRentPerM2Cents * areaM2),
      marketComparableRentCents: Math.round(marketRentPerM2Cents * areaM2),
    }];
  });
  const dataQualityIssues: ReportingQualityIssue[] = [
    ...comparableUnits.flatMap((unit) =>
      dispositionToMfRentCategory(unit.disposition)
        ? []
        : [{
            code: "MISSING_MF_UNIT_DISPOSITION" as const,
            severity: "WARNING" as const,
            message: "Unit has no MF-supported disposition.",
            propertyId: unit.propertyId,
            unitId: unit.unitId,
            ...(unit.leaseId ? { leaseId: unit.leaseId } : {}),
          }],
    ),
    ...[...new Set(comparableUnits.map((unit) => unit.propertyId))].flatMap((propertyId) =>
      byProperty.has(propertyId)
        ? []
        : [{
            code: "MISSING_MF_PROPERTY_LOCATION" as const,
            severity: "WARNING" as const,
            message: "Property has no current MF territory mapping.",
            propertyId,
          }],
    ),
  ];
  const propertyIds = new Set([...units.map((unit) => unit.propertyId), ...benchmarks.map((row) => row.propertyId)]);
  const propertyRows = [...propertyIds].map((propertyId) => {
    const propertyUnits = comparableUnits.filter((unit) => unit.propertyId === propertyId);
    const covered = rows.filter((row) => row.propertyId === propertyId);
    const totalComparableAreaM2 = propertyUnits.reduce((sum, unit) => sum + unit.areaM2!, 0);
    const coveredAreaM2 = covered.reduce((sum, unit) => sum + unit.areaM2!, 0);
    const actualComparableRentCents = covered.reduce((sum, row) => sum + row.actualComparableRentCents, 0);
    const marketComparableRentCents = covered.reduce((sum, row) => sum + row.marketComparableRentCents, 0);
    return {
      propertyId,
      propertyName: propertyUnits[0]?.propertyName || units.find((unit) => unit.propertyId === propertyId)?.propertyName || "—",
      territoryName: byProperty.get(propertyId)?.territoryName ?? null,
      comparableUnits: propertyUnits.length,
      coveredUnits: covered.length,
      totalComparableAreaM2,
      coveredAreaM2,
      coverageBps: totalComparableAreaM2 ? Math.round(coveredAreaM2 * 10_000 / totalComparableAreaM2) : null,
      actualRentPerM2Cents: coveredAreaM2 ? Math.round(actualComparableRentCents / coveredAreaM2) : null,
      marketRentPerM2Cents: coveredAreaM2 ? Math.round(marketComparableRentCents / coveredAreaM2) : null,
      rentToMarketBps: marketComparableRentCents ? Math.round(actualComparableRentCents * 10_000 / marketComparableRentCents) : null,
      reversionaryPotentialCents: marketComparableRentCents - actualComparableRentCents,
    };
  });
  const totalComparableAreaM2 = propertyRows.reduce((sum, row) => sum + row.totalComparableAreaM2, 0);
  const coveredAreaM2 = propertyRows.reduce((sum, row) => sum + row.coveredAreaM2, 0);
  const actualComparableRentCents = rows.reduce((sum, row) => sum + row.actualComparableRentCents, 0);
  const marketComparableRentCents = rows.reduce((sum, row) => sum + row.marketComparableRentCents, 0);
  return {
    rows,
    propertyRows,
    dataQualityIssues,
    aggregate: {
      comparableUnits: comparableUnits.length,
      coveredUnits: rows.length,
      totalComparableAreaM2,
      coveredAreaM2,
      coverageBps: totalComparableAreaM2 ? Math.round(coveredAreaM2 * 10_000 / totalComparableAreaM2) : null,
      actualRentPerM2Cents: coveredAreaM2 ? Math.round(actualComparableRentCents / coveredAreaM2) : null,
      marketRentPerM2Cents: coveredAreaM2 ? Math.round(marketComparableRentCents / coveredAreaM2) : null,
      rentToMarketBps: marketComparableRentCents ? Math.round(actualComparableRentCents * 10_000 / marketComparableRentCents) : null,
      reversionaryPotentialCents: marketComparableRentCents - actualComparableRentCents,
    },
  };
}
