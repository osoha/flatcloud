import { ChargeCategory, LeaseCreditType, type Prisma, type RentTiming } from "@prisma/client";
import { businessMonthKey } from "./calendar";
import { moneyToCents, text } from "./forms";
import { periodDueDate, periodStart } from "./period";

export const OPENING_DEBT_DESCRIPTION = "Počáteční nedoplatek při převzetí";
export const OPENING_OVERPAYMENT_DESCRIPTION = "Počáteční přeplatek při převzetí";
export type OpeningBalanceType = "ZERO" | "DEBT" | "OVERPAYMENT";

export function resolveLeaseFinancialOnboarding(startDate: Date, form: FormData, now = new Date()) {
  const legalStartPeriod = businessMonthKey(startDate);
  const currentBusinessPeriod = businessMonthKey(now);
  const historical = legalStartPeriod < currentBusinessPeriod;
  const requested = historical ? text(form, "financialTrackingFromPeriod") || currentBusinessPeriod : legalStartPeriod;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requested)) throw new Error("Finanční evidence od musí být platný měsíc.");
  if (requested < legalStartPeriod) throw new Error("Finanční evidence nemůže začínat před platností smlouvy.");
  const rawType = historical ? text(form, "openingBalanceType") || "ZERO" : "ZERO";
  const openingBalanceType: OpeningBalanceType = rawType === "DEBT" || rawType === "OVERPAYMENT" ? rawType : "ZERO";
  const openingBalanceCents = openingBalanceType === "ZERO" ? 0 : moneyToCents(form, "openingBalanceAmount");
  if (openingBalanceType !== "ZERO" && openingBalanceCents <= 0) throw new Error("Počáteční saldo musí být vyšší než nula.");
  return { historical, legalStartPeriod, financialTrackingFromPeriod: requested, openingBalanceType, openingBalanceCents, openingBalanceNote: text(form, "openingBalanceNote") };
}

export async function createOpeningBalance(tx: Prisma.TransactionClient, input: { leaseId: string; dueDay: number; rentTiming: RentTiming; financialTrackingFromPeriod: string; type: OpeningBalanceType; amountCents: number; note: string | null; createdById?: string }) {
  if (input.type === "ZERO") return { openingChargeId: null, openingCreditId: null };
  if (input.type === "DEBT") {
    const charge = await tx.charge.create({ data: { leaseId: input.leaseId, period: `OPENING-${input.financialTrackingFromPeriod}-${input.leaseId}`, dueDate: periodDueDate(input.financialTrackingFromPeriod, input.dueDay, input.rentTiming), amountCents: input.amountCents, manualOverride: true, note: input.note ? `${OPENING_DEBT_DESCRIPTION}: ${input.note}` : OPENING_DEBT_DESCRIPTION, items: { create: { name: OPENING_DEBT_DESCRIPTION, category: ChargeCategory.ADJUSTMENT, amountCents: input.amountCents } } } });
    return { openingChargeId: charge.id, openingCreditId: null };
  }
  const credit = await tx.leaseCredit.create({ data: { leaseId: input.leaseId, type: LeaseCreditType.OPENING_BALANCE, amountCents: input.amountCents, effectiveAt: periodStart(input.financialTrackingFromPeriod), description: OPENING_OVERPAYMENT_DESCRIPTION, note: input.note, createdById: input.createdById } });
  return { openingChargeId: null, openingCreditId: credit.id };
}
