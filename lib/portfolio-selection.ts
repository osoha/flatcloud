import type { ReportingScope } from "./reporting/access";

export type PortfolioSelection = ({ mode: "ALL" } | { mode: "SELECTED"; propertyIds: string[] }) & { ownerId?: string };
const cleanIds = (ids: Iterable<string>) => [...new Set([...ids].map((id) => id.trim()).filter(Boolean))].sort();

export function parsePortfolioSelection(input: { ownerId?: string | string[]; properties?: string | string[]; propertyId?: string | string[] }): PortfolioSelection {
  const ownerId = (Array.isArray(input.ownerId) ? input.ownerId[0] : input.ownerId)?.trim() || undefined;
  const raw = input.properties ?? input.propertyId;
  if (raw === undefined) return { mode: "ALL", ...(ownerId ? { ownerId } : {}) };
  const values = Array.isArray(raw) ? raw : [raw];
  return { mode: "SELECTED", ...(ownerId ? { ownerId } : {}), propertyIds: cleanIds(values.flatMap((value) => value.split(","))) };
}
export function serializePortfolioSelection(selection: PortfolioSelection) { return selection.mode === "ALL" ? null : cleanIds(selection.propertyIds).join(","); }
export function applyPortfolioSelection(scope: ReportingScope, selection: PortfolioSelection, unitPropertyIds: Record<string, string> = {}): ReportingScope {
  if (selection.mode === "ALL") return scope;
  const selected = new Set(selection.propertyIds);
  if (scope.mode === "ALL") return { mode: "SCOPED", wholePropertyIds: cleanIds(selection.propertyIds), unitIds: [] };
  return { mode: "SCOPED", wholePropertyIds: scope.wholePropertyIds.filter((id) => selected.has(id)), unitIds: scope.unitIds.filter((id) => selected.has(unitPropertyIds[id])) };
}
export function portfolioSelectionLabel(selection: PortfolioSelection, selectedCount: number, totalCount: number, _activeCount = totalCount) { return selection.ownerId ? "Zobrazeny jednotky vybraného vlastníka" : selection.mode === "ALL" ? `Zobrazeno všech ${totalCount} dostupných objektů` : `Zobrazeno ${selectedCount} z ${totalCount} dostupných objektů`; }
export function selectedPropertyIds(selection: PortfolioSelection, availableIds: string[]) { if (selection.mode === "ALL") return cleanIds(availableIds); const allowed = new Set(availableIds); return selection.propertyIds.filter((id) => allowed.has(id)); }
/** Operational LIVE KPIs consistently use active properties; archived properties stay available to catalog and navigation views. */
export function liveSelectedPropertyIds(selection: PortfolioSelection, properties: Array<{ id: string; active: boolean }>) { return selectedPropertyIds(selection, properties.filter((property) => property.active).map((property) => property.id)); }
export function withPortfolioSelection(pathname: string, current: URLSearchParams, selection: PortfolioSelection) { const params = new URLSearchParams(current); params.delete("propertyId"); if (selection.ownerId) params.set("ownerId", selection.ownerId); else params.delete("ownerId"); const value = serializePortfolioSelection(selection); if (value === null) params.delete("properties"); else params.set("properties", value); const query = params.toString(); return `${pathname}${query ? `?${query}` : ""}`; }

/** Complete scope query, including owner-only selections and explicit empty property sets. */
export function portfolioSelectionQuery(selection: PortfolioSelection) { return withPortfolioSelection("", new URLSearchParams(), selection).replace(/^\?/, ""); }
