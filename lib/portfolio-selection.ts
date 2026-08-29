import type { ReportingScope } from "./reporting/access";

export type PortfolioSelection = { mode: "ALL" } | { mode: "SELECTED"; propertyIds: string[] };
const cleanIds = (ids: Iterable<string>) => [...new Set([...ids].map((id) => id.trim()).filter(Boolean))].sort();

export function parsePortfolioSelection(input: { properties?: string | string[]; propertyId?: string | string[] }): PortfolioSelection {
  const raw = input.properties ?? input.propertyId;
  if (raw === undefined) return { mode: "ALL" };
  const values = Array.isArray(raw) ? raw : [raw];
  return { mode: "SELECTED", propertyIds: cleanIds(values.flatMap((value) => value.split(","))) };
}
export function serializePortfolioSelection(selection: PortfolioSelection) { return selection.mode === "ALL" ? null : selection.propertyIds.join(","); }
export function applyPortfolioSelection(scope: ReportingScope, selection: PortfolioSelection, unitPropertyIds: Record<string, string> = {}): ReportingScope {
  if (selection.mode === "ALL") return scope;
  const selected = new Set(selection.propertyIds);
  if (scope.mode === "ALL") return { mode: "SCOPED", wholePropertyIds: selection.propertyIds, unitIds: [] };
  return { mode: "SCOPED", wholePropertyIds: scope.wholePropertyIds.filter((id) => selected.has(id)), unitIds: scope.unitIds.filter((id) => selected.has(unitPropertyIds[id])) };
}
export function portfolioSelectionLabel(selection: PortfolioSelection, selectedCount: number, totalCount: number, activeCount = totalCount) { return selection.mode === "ALL" ? `Celé portfolio · ${activeCount} aktivních objektů` : `Výběr · ${selectedCount} z ${totalCount} objektů`; }
export function selectedPropertyIds(selection: PortfolioSelection, availableIds: string[]) { if (selection.mode === "ALL") return cleanIds(availableIds); const allowed = new Set(availableIds); return selection.propertyIds.filter((id) => allowed.has(id)); }
export function withPortfolioSelection(pathname: string, current: URLSearchParams, selection: PortfolioSelection) { const params = new URLSearchParams(current); params.delete("propertyId"); const value = serializePortfolioSelection(selection); if (value === null) params.delete("properties"); else params.set("properties", value); const query = params.toString(); return `${pathname}${query ? `?${query}` : ""}`; }
