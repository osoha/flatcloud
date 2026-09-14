import Link from "next/link";
import { moneyExact } from "@/lib/format";
import type { FinancialSeries } from "./FinancialTrendChart";
export function FinancialComparisonChart({ title, rows, series }: { title: string; rows: Array<{ label: string; values: Array<number | null>; href?: string }>; series: FinancialSeries[] }) {
  const max = Math.max(1, ...rows.flatMap(row => row.values.map(value => Math.abs(value || 0))));
  return <figure className="financial-comparison" aria-label={title}><figcaption>{title}</figcaption>{!rows.length && <p>Pro tento rozsah nejsou data.</p>}{rows.map((row, index) => <div className="financial-comparison-row" key={index}><strong>{row.href ? <Link href={row.href}>{row.label}</Link> : row.label}</strong>{series.map((item, column) => <div className="financial-comparison-value" key={item.label}><span>{item.label}</span><div className="financial-bar-track" aria-hidden="true"><i style={{ width: `${Math.abs(row.values[column] || 0) / max * 100}%`, background: item.color }}/></div><b>{row.values[column] == null ? "Nedoloženo" : moneyExact(row.values[column]!)}</b></div>)}</div>)}</figure>;
}
