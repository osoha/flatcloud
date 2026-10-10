import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type ActiveUser = { id: string; active?: boolean; role?: string };
type Owner = { id?: string; user: ActiveUser | null };
export type HousingResponsibility = {
  manager: ActiveUser | null;
  memberships?: Array<{ permission: string; user: ActiveUser }>;
  propertyOwner: Owner;
  communicationOwner?: Owner | null;
  ownershipMode?: string;
  unitOwnerships: Array<{ owner: Owner; shareBasisPoints?: number }>;
};

/** Ambiguous management is left unassigned; a landlord never displaces a manager. */
export function assignedHouseManagers<T extends ActiveUser>(property: { manager?: T | null; memberships?: Array<{ permission: string; user: T }> }): T[] {
  if (property.manager && property.manager.active !== false) return [property.manager];
  return [...new Map((property.memberships || [])
    .filter(row => row.user.active !== false && row.user.role === "PROPERTY_MANAGER" && ["EDIT", "ADMIN"].includes(row.permission))
    .map(row => [row.user.id, row.user])).values()];
}

export function resolveHousingResponsibility(input: HousingResponsibility): string | null {
  const managers = assignedHouseManagers(input);
  if (managers.length) return managers.length === 1 ? managers[0].id : null;
  const owners = [...new Set(input.unitOwnerships.filter(row => row.shareBasisPoints === undefined || row.shareBasisPoints > 0).map(row => row.owner.user)
    .filter((user): user is ActiveUser => Boolean(user && user.active !== false))
    .map(user => user.id))];
  if (owners.length) return owners.length === 1 ? owners[0] : null;
  if (input.unitOwnerships.length && !(input.ownershipMode === "WHOLE_OBJECT" && input.propertyOwner.id && input.unitOwnerships.every(row => row.owner.id === input.propertyOwner.id))) return null;
  // A building contact may represent the whole-building owner, never another unit owner.
  if (input.ownershipMode && input.ownershipMode !== "WHOLE_OBJECT") return null;
  const owner = input.propertyOwner.user;
  if (owner && owner.active !== false) return owner.id;
  const contact = input.communicationOwner?.user;
  return contact && contact.active !== false ? contact.id : null;
}

const userSelect = { id: true, active: true, role: true } as const;
export const responsibilityPropertySelect = {
  id: true, name: true, ownershipMode: true,
  manager: { select: userSelect },
  memberships: { where: { permission: { in: ["EDIT", "ADMIN"] as ("EDIT" | "ADMIN")[] }, user: { active: true, role: "PROPERTY_MANAGER" as const } }, select: { permission: true, user: { select: userSelect } } },
  owner: { select: { id: true, user: { select: userSelect } } },
  communicationOwner: { select: { id: true, user: { select: userSelect } } },
} satisfies Prisma.PropertySelect;

export async function responsibleUserForUnit(unitId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const unit = await client.unit.findUnique({ where: { id: unitId }, select: {
    ownerships: { select: { shareBasisPoints: true, owner: { select: { id: true, user: { select: userSelect } } } } },
    property: { select: responsibilityPropertySelect },
  } });
  return unit ? resolveHousingResponsibility({ ...unit.property, propertyOwner: unit.property.owner, unitOwnerships: unit.ownerships }) : null;
}
