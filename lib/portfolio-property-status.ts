export type PortfolioPropertyStatus = {
  label: "Archivováno" | "Vyžaduje pozornost" | "Bez předpisu" | "V pořádku" | "Částečně uhrazeno" | "Čeká na úhradu";
  tone: "archived" | "bad" | "ok" | "warn" | "neutral";
};

export function portfolioPropertyStatus(input: { archived: boolean; expectedCents: number; paidCents: number; overdueDebtCents: number }): PortfolioPropertyStatus {
  if (input.archived) return { label: "Archivováno", tone: "archived" };
  if (input.overdueDebtCents > 0) return { label: "Vyžaduje pozornost", tone: "bad" };
  if (input.expectedCents <= 0) return { label: "Bez předpisu", tone: "neutral" };
  if (input.paidCents >= input.expectedCents) return { label: "V pořádku", tone: "ok" };
  if (input.paidCents > 0) return { label: "Částečně uhrazeno", tone: "warn" };
  return { label: "Čeká na úhradu", tone: "warn" };
}
