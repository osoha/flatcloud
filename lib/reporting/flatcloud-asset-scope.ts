export type FlatcloudAssetScopeRow = {
  property: { flatcloudConsolidationBasisPoints: number | null };
  rentRoll: { monthlyNetRentCents: number | null };
  collections: { overdueDebtCents: number | null };
  deposits: { heldPrincipalCents: number | null };
};

const known = (value: number | null) => value ?? 0;
export function consolidatedAmount(amountCents: number | null, basisPoints: number | null): number {
  if (basisPoints == null || basisPoints <= 0) return 0;
  return Math.round(known(amountCents) * basisPoints / 10000);
}

export function calculateFlatcloudAssetScope(rows: FlatcloudAssetScopeRow[]) {
  const included = rows.filter((row) => (row.property.flatcloudConsolidationBasisPoints ?? 0) > 0);
  return {
    includedCount: included.length,
    externalCount: rows.filter((row) => row.property.flatcloudConsolidationBasisPoints === 0).length,
    unclassifiedCount: rows.filter((row) => row.property.flatcloudConsolidationBasisPoints == null).length,
    partialCount: included.filter((row) => row.property.flatcloudConsolidationBasisPoints! < 10000).length,
    grossMonthlyNetRentCents: included.reduce((sum, row) => sum + known(row.rentRoll.monthlyNetRentCents), 0),
    consolidatedMonthlyNetRentCents: included.reduce((sum, row) => sum + consolidatedAmount(row.rentRoll.monthlyNetRentCents, row.property.flatcloudConsolidationBasisPoints), 0),
    consolidatedOverdueDebtCents: included.reduce((sum, row) => sum + consolidatedAmount(row.collections.overdueDebtCents, row.property.flatcloudConsolidationBasisPoints), 0),
    consolidatedHeldDepositCents: included.reduce((sum, row) => sum + consolidatedAmount(row.deposits.heldPrincipalCents, row.property.flatcloudConsolidationBasisPoints), 0),
  };
}
