import { OwnerAffiliation, PropertyManagementScope } from "@prisma/client";

export const ownerAffiliationLabels: Record<OwnerAffiliation, string> = {
  UNCLASSIFIED: "Nezařazeno",
  FLATCLOUD_PARENT: "FlatCloud a.s. – mateřská společnost",
  FLATCLOUD_GROUP: "Skupina FlatCloud – SPV / BD",
  EXTERNAL: "Externí vlastník",
};

export const propertyManagementScopeLabels: Record<PropertyManagementScope, string> = {
  FULL_MANAGEMENT: "Kompletní správa",
  LIMITED_MANAGEMENT: "Omezený mandát",
  MONITORING_ONLY: "Pouze monitoring",
};

export function safeOwnerAffiliation(value: string | null | undefined): OwnerAffiliation {
  return Object.values(OwnerAffiliation).includes(value as OwnerAffiliation) ? value as OwnerAffiliation : OwnerAffiliation.UNCLASSIFIED;
}

export function safePropertyManagementScope(value: string | null | undefined): PropertyManagementScope {
  return Object.values(PropertyManagementScope).includes(value as PropertyManagementScope) ? value as PropertyManagementScope : PropertyManagementScope.FULL_MANAGEMENT;
}

export function consolidationBasisPoints(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const percent = Number(value.replace(",", "."));
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("Podíl konsolidace musí být číslo od 0 do 100 %.");
  return Math.round(percent * 100);
}

export function consolidationPercent(value: number | null | undefined): string {
  return value == null ? "" : String(value / 100);
}

export function consolidationLabel(value: number | null | undefined): string {
  if (value == null) return "Nezařazeno";
  if (value === 0) return "Externí · 0 %";
  if (value === 10000) return "FlatCloud · 100 %";
  return `FlatCloud · ${(value / 100).toLocaleString("cs-CZ")} %`;
}
