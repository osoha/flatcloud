import { prisma } from "./db";

export type PaymentLedgerRow = {
  id: string;
  accountingType: "Úhrada předpisu" | "Kauce";
  bookedAt: Date;
  effectiveAt: Date | null;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  leaseId: string;
  contractNumber: string | null;
  tenantId: string;
  tenantName: string;
  chargePeriod: string | null;
  allocatedAmountCents: number;
  transactionAmountCents: number;
  transactionId: string;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  variableSymbol: string | null;
  message: string | null;
  source: string;
};

export function payerPresentation(input: Pick<PaymentLedgerRow, "counterpartyName" | "counterpartyAccount">) {
  return { primary: input.counterpartyName || "Plátce neuveden", secondary: input.counterpartyAccount || null };
}

export async function loadPaymentLedgerRows(leaseIds: string[]): Promise<PaymentLedgerRow[]> {
  if (!leaseIds.length) return [];
  const [allocations, deposits] = await Promise.all([
    prisma.paymentAllocation.findMany({
      where: { charge: { leaseId: { in: leaseIds } } },
      include: { transaction: true, charge: { include: { lease: { include: { tenant: true, unit: { include: { property: true } } } } } } },
    }),
    prisma.securityDepositMovement.findMany({
      where: { leaseId: { in: leaseIds }, type: "RECEIVED", bankTransactionId: { not: null } },
      include: { bankTransaction: true, lease: { include: { tenant: true, unit: { include: { property: true } } } } },
    }),
  ]);
  const rows: PaymentLedgerRow[] = [
    ...allocations.map((allocation) => ({
      id: `allocation:${allocation.id}`,
      accountingType: "Úhrada předpisu" as const,
      bookedAt: allocation.transaction.bookedAt,
      effectiveAt: null,
      propertyId: allocation.charge.lease.unit.propertyId,
      propertyName: allocation.charge.lease.unit.property.name,
      unitId: allocation.charge.lease.unitId,
      unitLabel: allocation.charge.lease.unit.label,
      leaseId: allocation.charge.leaseId,
      contractNumber: allocation.charge.lease.contractNumber,
      tenantId: allocation.charge.lease.tenantId,
      tenantName: allocation.charge.lease.tenant.name,
      chargePeriod: allocation.charge.period,
      allocatedAmountCents: allocation.amountCents,
      transactionAmountCents: allocation.transaction.amountCents,
      transactionId: allocation.transactionId,
      counterpartyName: allocation.transaction.counterpartyName,
      counterpartyAccount: allocation.transaction.counterpartyIban,
      variableSymbol: allocation.transaction.variableSymbol,
      message: allocation.transaction.message,
      source: allocation.transaction.source,
    })),
    ...deposits.flatMap((movement) => movement.bankTransaction ? [{
      id: `deposit:${movement.id}`,
      accountingType: "Kauce" as const,
      bookedAt: movement.bankTransaction.bookedAt,
      effectiveAt: movement.effectiveAt,
      propertyId: movement.lease.unit.propertyId,
      propertyName: movement.lease.unit.property.name,
      unitId: movement.lease.unitId,
      unitLabel: movement.lease.unit.label,
      leaseId: movement.leaseId,
      contractNumber: movement.lease.contractNumber,
      tenantId: movement.lease.tenantId,
      tenantName: movement.lease.tenant.name,
      chargePeriod: null,
      allocatedAmountCents: movement.amountCents,
      transactionAmountCents: movement.bankTransaction.amountCents,
      transactionId: movement.bankTransaction.id,
      counterpartyName: movement.bankTransaction.counterpartyName,
      counterpartyAccount: movement.bankTransaction.counterpartyIban,
      variableSymbol: movement.bankTransaction.variableSymbol,
      message: movement.bankTransaction.message,
      source: movement.bankTransaction.source,
    }] : []),
  ];
  return rows.sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime() || a.id.localeCompare(b.id));
}
