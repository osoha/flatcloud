import type { calculateRentForecastWithAssumptions } from "@/lib/reporting/rent-forecast";
type Forecast = ReturnType<typeof calculateRentForecastWithAssumptions>;
export function ForecastLeaseSummary({ forecast }: { forecast: Forecast }) {
  const indefinite = forecast.unitRows.filter(row => !row.effectiveEnd).length;
  const later = forecast.leaseCount - indefinite - forecast.expiringLeaseCount;
  return <p className="muted-copy" data-testid="forecast-lease-summary">
    Doba neurčitá: <strong>{indefinite}</strong> · Končí v období: <strong>{forecast.expiringLeaseCount}</strong> · Končí po období: <strong>{later}</strong>.
    {indefinite > 0 && " Smlouvy na dobu neurčitou pokračují v grafu; bez nastavené indexace je jejich příspěvek vodorovný."}
    {forecast.leaseCount > 0 && indefinite === 0 && later === 0 && " Všechny smlouvy v období skončí. Od měsíce po poslední expiraci bude smluvní příjem nulový."}
  </p>;
}
