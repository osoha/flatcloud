export function assertTransactionAcceptsRentAllocation(status: string) {
  if (status === "IGNORED") throw new Error("Ignorovanou nebo stornovanou platbu nelze přiřadit k předpisu.");
}

export function assertTransactionAcceptsDeposit(status: string) {
  if (status === "IGNORED") throw new Error("Ignorovanou nebo stornovanou platbu nelze zaúčtovat jako kauci.");
}

export function assertActiveChargeForPayment(active: boolean) {
  if (!active) throw new Error("K neaktivnímu předpisu nelze běžně přiřadit platbu.");
}

export function assertNoReceivedDepositForTransactionAction(receivedDepositCount: number, action: "ignore" | "rule") {
  if (!receivedDepositCount) return;
  if (action === "ignore") throw new Error("Platbu nelze ignorovat, protože její část byla zaúčtována jako kauce.");
  throw new Error("Pro platbu s evidovanou kaucí nelze vytvořit párovací pravidlo ani ji znovu zpracovat.");
}

export function transactionLeaseRuleAction(value: string | null | undefined): "MATCH_LEASE" | "SUGGEST_LEASE" {
  const action = value || "MATCH_LEASE";
  if (action !== "MATCH_LEASE" && action !== "SUGGEST_LEASE") throw new Error("Vyberte podporovanou akci párovacího pravidla.");
  return action;
}
