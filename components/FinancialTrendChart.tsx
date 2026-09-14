"use client";
import { useEffect, useRef, useState } from "react";
import { moneyExact } from "@/lib/format";
import { chartDomain, chartPercentRows, chartTickIndices, type FinancialPoint } from "@/lib/financial-chart";
export type FinancialSeries = { label: string; color: string; dashed?: boolean };
export function FinancialTrendChart({ title, rows, series, percent = false, pointClass = "", detail = false }: { title: string; rows: FinancialPoint[]; series: FinancialSeries[]; percent?: boolean; pointClass?: string; detail?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720), [unit, setUnit] = useState<"money" | "percent">("money"), [zero, setZero] = useState(!detail), [active, setActive] = useState<number | null>(null);
  useEffect(() => { const node = ref.current; if (!node) return; const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width))); observer.observe(node); return () => observer.disconnect(); }, []);
  const shown = unit === "percent" ? chartPercentRows(rows) : rows;
  const domain = chartDomain(shown.flatMap(row => row.values), zero);
  const left = width < 450 ? 64 : 88, right = 16, top = 16, bottom = 254;
  const times = rows.map(row => Date.parse(row.label));
  const calendar = times.every(Number.isFinite) && times[times.length - 1] > times[0];
  const x = (index: number) => rows.length === 1 ? (width + left - right) / 2 : left + (calendar ? (times[index] - times[0]) / (times[times.length - 1] - times[0]) : index / Math.max(1, rows.length - 1)) * (width - left - right);
  const y = (value: number) => bottom - (value - domain.min) / (domain.max - domain.min) * (bottom - top);
  const format = (value: number | null) => value == null ? unit === "percent" ? "Nelze vyjádřit" : "Nedoloženo" : unit === "percent" ? `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} %` : moneyExact(value);
  const ticks = chartTickIndices(rows.length, width - left);
  const selected = Math.min(active ?? rows.length - 1, rows.length - 1);
  const path = (column: number) => { let gap = true; return shown.map((row, index) => { const value = row.values[column]; if (value == null) { gap = true; return ""; } const command = `${gap ? "M" : "L"}${x(index)} ${y(value)}`; gap = false; return command; }).join(" "); };
  return <div className="financial-trend" ref={ref} data-testid="financial-trend">
    <div className="financial-chart-controls"><div role="group" aria-label={`Měřítko: ${title}`}><button type="button" aria-pressed={!zero} onClick={() => setZero(false)}>Detail vývoje</button><button type="button" aria-pressed={zero} onClick={() => setZero(true)}>Od nuly</button></div>{percent && <div role="group" aria-label={`Jednotky: ${title}`}><button type="button" aria-pressed={unit === "money"} onClick={() => setUnit("money")}>Kč / měsíc</button><button type="button" aria-pressed={unit === "percent"} onClick={() => setUnit("percent")}>Změna v %</button></div>}</div>
    <p className="muted-copy">{zero ? "Osa zahrnuje nulu." : "Detailní měřítko podle dat; osa nemusí začínat nulou."}{unit === "percent" && " Každá řada vůči vlastnímu prvnímu měsíci; nulový či chybějící základ nelze přepočítat."} Mezery znamenají chybějící podklad.</p>
    {!rows.length ? <p>Pro tento rozsah nejsou data.</p> : <><svg className="financial-trend-svg" viewBox={`0 0 ${width} 290`} height="290" role="img" aria-label={title}>
      {Array.from({ length: 5 }, (_, index) => { const value = domain.min + index * (domain.max - domain.min) / 4; return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#e4eaf3"/><text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#65758b">{unit === "percent" ? `${value.toFixed(1)} %` : new Intl.NumberFormat("cs-CZ", { notation: "compact", maximumFractionDigits: 1 }).format(value / 100)}</text></g>; })}
      {series.map((item, column) => <path key={item.label} d={path(column)} fill="none" stroke={item.color} strokeWidth={item.dashed ? 2 : 3} strokeDasharray={item.dashed ? "6 4" : undefined}/>)}
      {shown.map((row, index) => <g className={pointClass} key={`${row.label}-${index}`} tabIndex={0} role="button" aria-label={`${row.label}: ${series.map((item, column) => `${item.label} ${format(row.values[column])}`).join(", ")}`} onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)} onKeyDown={event => { if (event.key === "Escape") { setActive(null); event.currentTarget.blur(); } }}>
        <rect x={Math.max(left, x(index) - (width - left - right) / Math.max(rows.length, 1) / 2)} y={top} width={Math.max(2, (width - left - right) / Math.max(rows.length, 1))} height={bottom - top} fill="transparent"/>
        {series.map((item, column) => row.values[column] == null ? null : <circle key={item.label} cx={x(index)} cy={y(row.values[column]!)} r={selected === index || rows.length === 1 || shown[index - 1]?.values[column] == null || shown[index + 1]?.values[column] == null ? 4 : 0} fill={item.color}/>)}
        {ticks.includes(index) && <text x={x(index)} y="278" textAnchor={index === rows.length - 1 ? "end" : index === 0 ? "start" : "middle"} fontSize="11" fill="#65758b">{row.label}</text>}
      </g>)}
    </svg><div className="financial-chart-values" aria-live="polite"><strong>{shown[selected]?.label}</strong>{series.map((item, column) => <span key={item.label}><i style={{ background: item.color }}/>{item.label}: <b>{format(shown[selected]?.values[column] ?? null)}</b>{percent && unit === "money" && rows[0]?.values[column] != null && rows[0].values[column]! > 0 && rows[selected]?.values[column] != null && <small> · {((rows[selected].values[column]! / rows[0].values[column]! - 1) * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} % od začátku</small>}</span>)}</div>
    <details><summary>Datová tabulka grafu</summary><div className="table-wrap" tabIndex={0}><table><thead><tr><th>Období</th>{series.map(item => <th key={item.label}>{item.label}</th>)}</tr></thead><tbody>{shown.map((row, index) => <tr key={index}><th>{row.label}</th>{row.values.map((value, column) => <td key={column}>{format(value)}</td>)}</tr>)}</tbody></table></div></details></>}
  </div>;
}
