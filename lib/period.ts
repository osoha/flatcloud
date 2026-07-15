export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function periodStart(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Období musí být ve formátu RRRR-MM.");
  const [year, month] = period.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("Neplatný měsíc.");
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

export function periodDueDate(period: string, dueDay: number) {
  const start = periodStart(period);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const maxDay = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Math.max(dueDay, 1), maxDay), 12));
}

export function periodLabel(period: string) {
  const start = periodStart(period);
  return new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(start);
}
