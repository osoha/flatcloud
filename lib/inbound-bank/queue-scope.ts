import { bankAccountMatches } from "./bank-email";

type AccountScope = {
  accountNumber: string | null;
  bankCode: string | null;
  iban: string | null;
  propertyLinks: Array<{ propertyId: string }>;
  unitOwnerships: Array<{ unit: { propertyId: string } }>;
  leases: Array<{ unit: { propertyId: string } }>;
};

export function notificationPropertyIds(row: { propertyId: string | null; recipientAccount: string | null }, accounts: AccountScope[]) {
  if (row.propertyId) return [row.propertyId];
  const matches = accounts.filter((account) => bankAccountMatches(account, row.recipientAccount));
  return [...new Set(matches.flatMap((account) => [
    ...account.propertyLinks.map((link) => link.propertyId),
    ...account.unitOwnerships.map((ownership) => ownership.unit.propertyId),
    ...account.leases.map((lease) => lease.unit.propertyId),
  ]))];
}

export function notificationInScope(row: { propertyId: string | null; recipientAccount: string | null }, accounts: AccountScope[], propertyIds: string[]) {
  const inferred = notificationPropertyIds(row, accounts);
  // Unidentified mail stays visible to the central administrator even with a
  // house selected, so incomplete parsing cannot silently remove it from work.
  return !inferred.length || inferred.some((id) => propertyIds.includes(id));
}
