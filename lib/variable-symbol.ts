import type { Prisma } from "@prisma/client";
import { isPropertyCode, isUnitCode } from "./business-identity";

type PropertyForLeaseIdentity = { propertyCode: string };
type UnitForLeaseIdentity = { unitCode: string; leases: { id?: string }[] };

export type ProposedLeaseIdentity = {
  sequence: number;
  variableSymbol: string;
  contractNumber: string;
};

export function validateVariableSymbol(value: string) {
  if (!/^\d{1,10}$/.test(value)) throw new Error("Variabilní symbol musí obsahovat 1 až 10 číslic.");
  return value;
}

export function proposedLeaseIdentity(property: PropertyForLeaseIdentity, unit: UnitForLeaseIdentity, used: Set<string>): ProposedLeaseIdentity | null {
  if (!isPropertyCode(property.propertyCode) || !isUnitCode(unit.unitCode)) return null;
  let order = unit.leases.length + 1;
  for (; order <= 99; order += 1) {
    const sequence = String(order).padStart(2, "0");
    const variableSymbol = `${property.propertyCode}${unit.unitCode}${sequence}`;
    if (!used.has(variableSymbol)) {
      return {
        sequence: order,
        variableSymbol,
        contractNumber: `NS-P${property.propertyCode}-U${unit.unitCode}-${sequence}`,
      };
    }
  }
  return null;
}

export function proposedVariableSymbol(property: PropertyForLeaseIdentity, unit: UnitForLeaseIdentity, used: Set<string>) {
  return proposedLeaseIdentity(property, unit, used)?.variableSymbol ?? null;
}
export async function assertUniqueVariableSymbol(
  tx: Prisma.TransactionClient,
  ownerBankAccountId: string,
  value: string,
  excludeLeaseId?: string,
) {
  const lockKey = `flatcloud:lease-variable-symbol:${ownerBankAccountId}:${value}`;
  await tx.$queryRaw<Array<{ locked: number }>>`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const duplicate = await tx.lease.findFirst({
    where: {
      ownerBankAccountId,
      variableSymbol: value,
      ...(excludeLeaseId ? { id: { not: excludeLeaseId } } : {}),
    },
    include: { unit: true, tenant: true },
  });
  if (duplicate) {
    throw new Error(`Variabilní symbol ${value} už na tomto účtu historicky používá smlouva ${duplicate.unit.label} · ${duplicate.tenant.name}. Zvolte jiný VS.`);
  }
}
