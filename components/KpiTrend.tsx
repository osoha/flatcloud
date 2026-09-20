import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { collectionComparison } from "@/lib/collection-comparison";

export function KpiTrend({ comparison }: { comparison: ReturnType<typeof collectionComparison> }) {
  if (!comparison) return <div className="kpi-trend"><small>Srovnání není dostupné</small></div>;
  const delta = Math.round(comparison.deltaPoints * 10) / 10;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const [year, month] = comparison.previousPeriod.split("-").map(Number);
  return <div className={`kpi-trend ${delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral"}`}>
    <Icon aria-hidden="true"/><div>{delta > 0 ? "+" : ""}{delta.toLocaleString("cs-CZ")} p. b.
      <small>oproti 1.–{comparison.comparisonDay}. {month}. {year}</small>
    </div>
  </div>;
}
