type Owner = {
  id: string;
  name: string;
  type: string;
  ico: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth?: Date | null;
  legalRegistry?: string | null;
};
type Ownership = { owner: Owner; ownerBankAccountId?: string | null };
export function contractLandlord(lease: {
  startDate: Date;
  ownerBankAccountId: string | null;
  landlordPeriods: Array<{
    fromPeriod: string;
    toPeriod: string | null;
    owner: Owner;
  }>;
  unit: {
    ownerships: Ownership[];
    property: { owner: Owner; ownershipMode: string; ownerships: Ownership[] };
  };
}) {
  const period = lease.startDate.toISOString().slice(0, 7);
  const explicit = lease.landlordPeriods.filter(
    (p) => p.fromPeriod <= period && (!p.toPeriod || p.toPeriod >= period),
  );
  if (explicit.length === 1)
    return {
      owner: explicit[0].owner,
      source: "Pronajímatel evidovaný pro začátek nájmu.",
    };
  if (explicit.length > 1)
    return {
      owner: null,
      source:
        "Pro stejné období je uvedeno více pronajímatelů. Vyberte smluvní stranu podle smlouvy.",
    };
  const unit = lease.unit.ownerships;
  const selected = unit.filter(
    (o) =>
      lease.ownerBankAccountId &&
      o.ownerBankAccountId === lease.ownerBankAccountId,
  );
  if (selected.length === 1)
    return {
      owner: selected[0].owner,
      source:
        "Vlastník vybraný u jednotky pro tento nájem. Při přípravě starší smlouvy zkontrolujte případnou změnu vlastníka.",
    };
  if (unit.length === 1)
    return {
      owner: unit[0].owner,
      source:
        "Vlastník evidovaný u jednotky. Při přípravě starší smlouvy zkontrolujte případnou změnu vlastníka.",
    };
  if (unit.length > 1)
    return {
      owner: null,
      source:
        "Jednotka má více vlastníků. Vyberte pronajímatele podle smlouvy.",
    };
  if (lease.unit.property.ownershipMode !== "WHOLE_OBJECT")
    return {
      owner: null,
      source:
        "Doplňte vlastníka této jednotky; vlastník domu nemusí být jejím pronajímatelem.",
    };
  const owners = lease.unit.property.ownerships;
  if (owners.length > 1)
    return {
      owner: null,
      source: "Dům má více vlastníků. Vyberte pronajímatele podle smlouvy.",
    };
  return {
    owner: owners[0]?.owner || lease.unit.property.owner,
    source:
      "Vlastník evidovaný u celého domu. Při přípravě starší smlouvy zkontrolujte případnou změnu vlastníka.",
  };
}
