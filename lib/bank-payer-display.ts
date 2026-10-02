import { prisma } from "./db";
import { hasAllPropertyAccess } from "./auth";
import { bankAccountMatches } from "./inbound-bank/bank-email";
import { normalizeExpenseAccount } from "./bank-expense-rule-policy";

type Payment = { id: string; propertyId: string | null; amountCents: number | null; counterpartyName: string | null; counterpartyAccount: string | null; recipientAccount?: string | null };
type Lease = { tenantBankAccount: string | null; tenant: { id: string; name: string; payerAccounts: string[] }; ownerBankAccount?: { accountNumber: string | null; bankCode: string | null; iban: string | null } | null };
export function missingBankPayer(name: string | null) {
  return !name?.trim() || /^(?:neznámý plátce|neznamy platce|plátce neuveden|platce neuveden|unknown payer|—|-)$/i.test(name.trim());
}
export function payerDisplayName(payment: Omit<Payment, "id" | "propertyId">, leases: Lease[]) {
  if (!missingBankPayer(payment.counterpartyName)) return payment.counterpartyName!;
  if (!payment.amountCents || payment.amountCents < 0 || !payment.counterpartyAccount) return "Plátce neuveden";
  const account = normalizeExpenseAccount(payment.counterpartyAccount);
  const candidates = leases.filter(l => (!payment.recipientAccount || !l.ownerBankAccount || bankAccountMatches(l.ownerBankAccount, payment.recipientAccount))
    && [l.tenantBankAccount, ...l.tenant.payerAccounts].filter((a): a is string => Boolean(a)).map(normalizeExpenseAccount).includes(account));
  const tenants = new Map(candidates.map(l => [l.tenant.id, l.tenant.name]));
  return tenants.size === 1 ? [...tenants.values()][0] : "Plátce neuveden";
}

// Lookup is presentation only: original bank fields, pairing and accounting stay intact.
export async function loadPayerDisplayNames(user: { id: string; role: string; allProperties?: boolean }, payments: Payment[]) {
  const propertyIds = [...new Set(payments.filter(p => missingBankPayer(p.counterpartyName) && p.amountCents && p.amountCents > 0 && p.counterpartyAccount).map(p => p.propertyId).filter((id): id is string => Boolean(id)))];
  if (!propertyIds.length) return new Map<string, string>();
  const leases = await prisma.lease.findMany({ where: { unit: { propertyId: { in: propertyIds } } }, include: {
    tenant: true, ownerBankAccount: true, unit: { include: { userAccesses: { where: { userId: user.id } }, property: { select: { memberships: { where: { userId: user.id } } } } } },
  } });
  const names = new Map<string, string>();
  for (const p of payments) {
    const candidates = leases.filter(l => l.unit.propertyId === p.propertyId);
    const name = payerDisplayName(p, candidates);
    // Count ambiguity across the whole house before considering visibility.
    const visible = candidates.filter(l => hasAllPropertyAccess(user) || l.unit.property.memberships.length || l.unit.userAccesses.length);
    if (name !== "Plátce neuveden" && payerDisplayName(p, visible) === name) names.set(p.id, name);
  }
  return names;
}
