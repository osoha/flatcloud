/** Only the public profile fields needed by a tenant's actual housing contact. */
export const portalContactUserSelect = {
  id: true, name: true, active: true, phone: true, email: true,
  avatarMimeType: true, avatarChoice: true, updatedAt: true,
} as const;

export const portalContactOwnerSelect = {
  id: true, name: true, active: true, phone: true, email: true,
  user: {select: portalContactUserSelect},
} as const;

type ContactUser = {
  id: string; name: string; active?: boolean; phone: string | null; email: string;
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
