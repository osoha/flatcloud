export type CostAllocationMethod = "equal" | "area" | "custom";

export type AllocationShare = {
  unitId: string;
  shareBasisPoints: number;
};

export type CostAllocation = AllocationShare & {
  amountCents: number;
};

function largestRemainder(total: number, weights: Array<{ unitId: string; weight: number }>) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Rozdělovaná hodnota musí být nezáporné celé číslo.");
  if (!weights.length || weights.some((row) => !Number.isFinite(row.weight) || row.weight <= 0)) throw new Error("Vyberte alespoň jednu jednotku s platnou vahou.");
  const weightTotal = weights.reduce((sum, row) => sum + row.weight, 0);
  const rows = weights.map((row) => {
    const exact = total * row.weight / weightTotal;
    return { unitId: row.unitId, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = total - rows.reduce((sum, row) => sum + row.value, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.unitId.localeCompare(b.unitId))) {
    if (remaining <= 0) break;
    row.value += 1;
    remaining -= 1;
  }
  return rows.map(({ unitId, value }) => ({ unitId, value }));
}

export function allocationBasisPoints(method: Exclude<CostAllocationMethod, "custom">, units: Array<{ id: string; areaM2: number | null }>): AllocationShare[] {
  if (!units.length) throw new Error("Nemovitost nemá jednotky, mezi které lze náklad rozdělit.");
  const weights = units.map((unit) => {
    if (method === "area" && (!unit.areaM2 || unit.areaM2 <= 0)) throw new Error("Pro rozdělení podle plochy doplňte výměru u všech jednotek.");
    return { unitId: unit.id, weight: method === "area" ? unit.areaM2! : 1 };
  });
  return largestRemainder(10_000, weights).map((row) => ({ unitId: row.unitId, shareBasisPoints: row.value }));
}

export function shareBasisPointsFromPercent(raw: string) {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Podíl zadejte v procentech s nejvýše dvěma desetinnými místy.");
  const basisPoints = Math.round(Number(normalized) * 100);
  if (basisPoints <= 0 || basisPoints > 10_000) throw new Error("Podíl jednotky musí být vyšší než 0 % a nejvýše 100 %.");
  return basisPoints;
}

export function validateCustomShares(shares: AllocationShare[]) {
  if (!shares.length) throw new Error("Vyplňte podíl alespoň u jedné jednotky.");
  const total = shares.reduce((sum, row) => sum + row.shareBasisPoints, 0);
  if (total !== 10_000) throw new Error(`Součet podílů musí být přesně 100 %. Nyní je ${(total / 100).toLocaleString("cs-CZ")} %.`);
  return shares;
}

export function allocateCostAmount(amountCents: number, shares: AllocationShare[]): CostAllocation[] {
  validateCustomShares(shares);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error("Částka nákladu je mimo podporovaný rozsah.");
  const divisor = BigInt(10_000);
  const amounts = shares.map((row) => {
    const numerator = BigInt(amountCents) * BigInt(row.shareBasisPoints);
    return { unitId: row.unitId, value: numerator / divisor, remainder: numerator % divisor };
  });
  let remaining = BigInt(amountCents) - amounts.reduce((sum, row) => sum + row.value, BigInt(0));
  for (const row of [...amounts].sort((a, b) => a.remainder === b.remainder ? a.unitId.localeCompare(b.unitId) : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining <= 0) break;
    row.value += BigInt(1);
    remaining -= BigInt(1);
  }
  const amountByUnit = new Map(amounts.map((row) => [row.unitId, Number(row.value)]));
  return shares.map((row) => ({ ...row, amountCents: amountByUnit.get(row.unitId)! }));
}

export function propertyCostScopeLabel(cost: { unit?: { label: string } | null; allocations?: Array<{ unit: { label: string } }> }) {
  const allocations = cost.allocations || [];
  if (allocations.length === 1) return `Jednotka ${allocations[0].unit.label}`;
  if (allocations.length > 1) return `${allocations.length} jednotek`;
  return cost.unit ? `Jednotka ${cost.unit.label}` : "Celý objekt";
}
