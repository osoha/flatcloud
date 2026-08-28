type UnitOwnershipLike = {
  ownerBankAccountId?: string | null;
  ownerBankAccount?: { notificationVerifiedAt?: Date | string | null } | null;
  owner?: { name: string } | null;
};

type UnitLike = {
  id: string;
  label: string;
  ownerships: UnitOwnershipLike[];
};

export type UnitBankVerificationState = {
  unitId: string;
  unitLabel: string;
  ownerName: string | null;
  ownerBankAccountId: string | null;
  configured: boolean;
  verified: boolean;
};

/**
 * Bank-email readiness is evaluated through the payment account assigned to
 * the owner of each unit. A property-level account link alone must never make
 * the whole property look verified.
 */
export function bankVerificationCoverage(units: UnitLike[], _links?: unknown[]) {
  const unitStates: UnitBankVerificationState[] = units.map((unit) => {
    // The current FlatCloud ownership workflow assigns one effective owner/payment
    // account per unit. This mirrors lease creation, which uses ownerships[0].
    const ownership = unit.ownerships[0] ?? null;
    const ownerBankAccountId = ownership?.ownerBankAccountId ?? null;
    return {
      unitId: unit.id,
      unitLabel: unit.label,
      ownerName: ownership?.owner?.name ?? null,
      ownerBankAccountId,
      configured: Boolean(ownerBankAccountId),
      verified: Boolean(ownership?.ownerBankAccount?.notificationVerifiedAt),
    };
  });

  const totalUnits = unitStates.length;
  const configuredUnits = unitStates.filter((unit) => unit.configured).length;
  const verifiedUnits = unitStates.filter((unit) => unit.verified).length;
  return {
    unitStates,
    totalUnits,
    configuredUnits,
    verifiedUnits,
    allVerified: totalUnits > 0 && verifiedUnits === totalUnits,
  };
}

export function linkIsUsedByUnit(
  ownerBankAccountId: string,
  units: Array<{ ownerships: Array<{ ownerBankAccountId?: string | null }> }>,
) {
  return units.some((unit) => unit.ownerships.some((ownership) => ownership.ownerBankAccountId === ownerBankAccountId));
}
