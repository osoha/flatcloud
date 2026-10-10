export type BasicPortfolioView = "buildings" | "units";
export const basicPortfolioViewCookie = (userId: string) => `flatberry-basic-view-${userId}`;
export function basicPortfolioView(value: string | undefined): BasicPortfolioView | null {
  return value === "buildings" || value === "units" ? value : null;
}
export function defaultBasicPortfolioView(unitCount: number, propertyCount: number): BasicPortfolioView {
  return unitCount > 6 && propertyCount > 1 ? "buildings" : "units";
}
