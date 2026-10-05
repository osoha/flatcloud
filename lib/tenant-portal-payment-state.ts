import {businessDateKey, businessTodayKey} from "./calendar";

export type PortalPaymentTone = "paid" | "overdue" | "current" | "scheduled" | "neutral";

/** A paid balance wins over period; overdue current debt wins over future rent. */
export function tenantPortalPaymentState(charge: {
  period: string;
  dueDate: Date;
  remainingCents: number;
  receivedCents: number;
  offsetCents: number;
  debtTreatment: "CURRENT" | "HISTORICAL" | "EXCLUDED";
}, today = businessTodayKey()): {tone: PortalPaymentTone; future: boolean; state: string} {
  if (charge.remainingCents === 0) return {tone: "paid", future: false, state: charge.offsetCents > 0 ? "Vypořádáno se zápočtem" : "Uhrazeno"};
  if (charge.debtTreatment !== "CURRENT") return {tone: "neutral", future: false, state: charge.debtTreatment === "HISTORICAL" ? "Historická pohledávka" : "Mimo aktuální dluh"};
  const partial = charge.receivedCents > 0 || charge.offsetCents > 0;
  const due = businessDateKey(charge.dueDate);
  if (due < today) return {tone: "overdue", future: false, state: partial ? "Částečně · po splatnosti" : "Po splatnosti"};
  const future = /^\d{4}-(0[1-9]|1[0-2])$/.test(charge.period) && charge.period > today.slice(0, 7);
  const timing = due === today ? "Splatnost dnes" : future ? "Budoucí nájem" : "Před splatností";
  return {tone: future ? "scheduled" : "current", future, state: partial ? `Částečně · ${timing.toLocaleLowerCase("cs-CZ")}` : timing};
}
