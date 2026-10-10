/** Only the public profile fields needed by a tenant's actual housing contact. */
export const portalContactUserSelect = {
  id: true, name: true, active: true, role: true, phone: true, email: true,
  avatarMimeType: true, avatarChoice: true, updatedAt: true,
} as const;

export const portalContactOwnerSelect = {
  id: true, name: true, active: true, phone: true, email: true,
  user: {select: portalContactUserSelect},
} as const;

/** Shared by the contact card, avatar authorization and tenant request routing. */
export const portalContactPropertyInclude = {
  manager: {select: portalContactUserSelect},
  memberships: {
    where: {user: {active: true, role: "PROPERTY_MANAGER" as const}, permission: {in: ["EDIT", "ADMIN"] as ("EDIT" | "ADMIN")[]}},
    select: {permission: true, user: {select: portalContactUserSelect}},
  },
  owner: {select: portalContactOwnerSelect},
  communicationOwner: {select: portalContactOwnerSelect},
} as const;

type ContactUser = {
  id: string; name: string; active?: boolean; role?: string; phone: string | null; email: string;
  avatarMimeType?: string | null; avatarChoice?: string | null; updatedAt?: Date;
};
type ContactOwner = {
  id?: string; name: string; active?: boolean; phone?: string | null;
  email?: string | null; user?: ContactUser | null;
};
type ContactLease = {
  ownerBankAccount?: {owner: ContactOwner} | null;
  unit: {
    ownerships?: Array<{owner: ContactOwner}>;
    property: {
      manager?: ContactUser | null;
      memberships?: Array<{permission: string; user: ContactUser}>;
      owner: ContactOwner;
      communicationOwner?: ContactOwner | null;
      ownershipMode?: string;
    };
  };
};
export type TenantPortalContact = {
  kind: "manager" | "owner";
  name: string;
  phone: string | null;
  email: string | null;
  user: ContactUser | null;
};

/** Resolve the same contact for the visible card and its private avatar endpoint. */
export function tenantPortalContact(lease: ContactLease): TenantPortalContact | null {
  const property = lease.unit.property;
  const manager = property.manager;
  if (manager && manager.active !== false) {
    return {kind: "manager", name: manager.name, phone: manager.phone, email: manager.email, user: manager};
  }
  // A property manager may be assigned through user permissions instead of managerId.
  // Whole-house edit access is required; unit-only or read-only access is not management.
  const managers = [...new Map((property.memberships || [])
    .filter(row => row.user.active !== false && row.user.role === "PROPERTY_MANAGER" && ["EDIT", "ADMIN"].includes(row.permission))
    .map(row => [row.user.id, row.user])).values()];
  if (managers.length === 1) {
    const assigned = managers[0];
    return {kind: "manager", name: assigned.name, phone: assigned.phone, email: assigned.email, user: assigned};
  }
  if (managers.length > 1) {
    // Never nominate an arbitrary manager or substitute a landlord when management exists.
    return {kind: "manager", name: "Správa domu", phone: null, email: null, user: null};
  }
  const unitOwners = (lease.unit.ownerships || []).map(row => row.owner).filter(owner => owner.active !== false);
  const owner = lease.ownerBankAccount?.owner
    || (unitOwners.length === 1 ? unitOwners[0] : null)
    || property.communicationOwner
    || (property.ownershipMode === "WHOLE_OBJECT" ? property.owner : null);
  if (!owner || owner.active === false) return null;
  const user = owner.user?.active !== false ? owner.user || null : null;
  return {
    kind: "owner", name: owner.name,
    phone: owner.phone?.trim() || user?.phone || null,
    email: owner.email?.trim() || user?.email || null,
    user,
  };
}
