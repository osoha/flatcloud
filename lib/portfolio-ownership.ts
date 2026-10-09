import type { PortfolioSelection } from "./portfolio-selection";

type Owner = { id: string; name: string };
type Ownership = { ownerId: string; shareBasisPoints?: number; owner: Owner };
type Unit = { id: string; ownerships: Ownership[]; leases?: Array<{ tenantId: string }> };
export type OwnershipProperty = { id: string; ownershipMode: string; owner: Owner; ownerships: Ownership[]; units: Unit[] };

/** Unit ownership is authoritative. A communication contact/SVJ never implies ownership. */
export function unitPortfolioOwners(property: OwnershipProperty, unit: Unit): Owner[] {
  const positive = (rows: Ownership[]) => rows.filter(row => row.shareBasisPoints === undefined || row.shareBasisPoints > 0).map(row => row.owner);
  if (unit.ownerships.length) return positive(unit.ownerships);
  if (property.ownershipMode !== "WHOLE_OBJECT") return [];
  return property.ownerships.length ? positive(property.ownerships) : [property.owner];
}

/** Narrow already-authorized data; this function never grants access to properties or units. */
export function filterPortfolioProperties<T extends OwnershipProperty>(properties: T[], selection: PortfolioSelection): T[] {
  const selected = selection.mode === "ALL" ? null : new Set(selection.propertyIds);
  return properties.flatMap(property => {
    if (selected && !selected.has(property.id)) return [];
    if (!selection.ownerId) return [property];
    const units = property.units.filter(unit => unitPortfolioOwners(property, unit).some(owner => owner.id === selection.ownerId));
    return units.length ? [{ ...property, units } as T] : [];
  });
}

export type PortfolioPropertyOption = {
  id: string; name: string; address: string; city: string; active: boolean;
  ownerId?: string; ownerName?: string; scopeKind?: "FLATCLOUD" | "EXTERNAL" | "UNCLASSIFIED";
  /** Search aliases do not confer unit ownership or access. */
  ownerSearchNames?: string[];
  owners: Array<Owner & { unitIds: string[] }>;
};
export function portfolioPropertyOption(property: OwnershipProperty & { name: string; address: string; city: string; active: boolean; communicationOwner?: Owner | null; flatcloudConsolidationBasisPoints?: number | null }, showGroup = false): PortfolioPropertyOption {
  const owners = new Map<string, Owner & { unitIds: string[] }>();
  for (const unit of property.units) for (const owner of unitPortfolioOwners(property, unit)) {
    const row = owners.get(owner.id) ?? { ...owner, unitIds: [] };
    if (!row.unitIds.includes(unit.id)) row.unitIds.push(unit.id);
    owners.set(owner.id, row);
  }
  return { id: property.id, name: property.name, address: property.address, city: property.city, active: property.active,
    ownerId: property.communicationOwner?.id || property.owner.id, ownerName: property.communicationOwner?.name || property.owner.name,
    ownerSearchNames: [...new Set([property.owner.name, ...property.ownerships.filter(row => row.shareBasisPoints === undefined || row.shareBasisPoints > 0).map(row => row.owner.name)])],
    scopeKind: !showGroup ? undefined : property.flatcloudConsolidationBasisPoints == null ? "UNCLASSIFIED" : property.flatcloudConsolidationBasisPoints > 0 ? "FLATCLOUD" : "EXTERNAL",
    owners: [...owners.values()] };
}

export function portfolioOwnerPresets(properties: PortfolioPropertyOption[]) {
  const owners = new Map<string, { id: string; name: string; propertyIds: string[]; unitIds: string[] }>();
  for (const property of properties) for (const owner of property.owners) {
    const row = owners.get(owner.id) ?? { id: owner.id, name: owner.name, propertyIds: [], unitIds: [] };
    if (!row.propertyIds.includes(property.id)) row.propertyIds.push(property.id);
    row.unitIds = [...new Set([...row.unitIds, ...owner.unitIds])];
    owners.set(owner.id, row);
  }
  return [...owners.values()].sort((a, b) => a.name.localeCompare(b.name, "cs") || a.id.localeCompare(b.id));
}

/** Shared property tasks remain relevant; tasks tied to somebody else's unit/lease do not. */
export function portfolioTaskFilter(properties: OwnershipProperty[], selection: PortfolioSelection) {
  if (!selection.ownerId) return selection.mode === "ALL" ? {} : { OR: [{ propertyId: { in: properties.map(p => p.id) } }, { propertyId: null }] };
  const unitIds = properties.flatMap(p => p.units.map(u => u.id));
  const tenantIds = [...new Set(properties.flatMap(p => p.units.flatMap(u => (u.leases ?? []).map(lease => lease.tenantId))))];
  return { OR: [
    { unitId: { in: unitIds } },
    { unitId: null, lease: { unitId: { in: unitIds } } },
    { unitId: null, leaseId: null, tenantId: { in: tenantIds }, propertyId: { in: properties.map(p => p.id) } },
    { unitId: null, leaseId: null, tenantId: null, propertyId: { in: properties.map(p => p.id) } },
  ] };
}
