"use client";

import { useEffect, useRef, useState } from "react";
import { FinancialTrendChart } from "./FinancialTrendChart";
import { money } from "@/lib/format";
import type { RentForecastExpiryEvent } from "@/lib/reporting/rent-forecast";

type Point = { label: string; expected: number; paid: number };
type OccupancyPoint = { label: string; occupancyBps: number | null; rentable: number; occupied: number; vacant: number; unknown: number };
type ForecastPoint = { period: string; contractualCents: number; plannedCents: number; expectedCollectedCents: number; mfProjectedCents?: number | null };
type ChartMode = "bar" | "line";

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null), [width, setWidth] = useState(720);
  useEffect(() => { if (!ref.current) return; const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width))); observer.observe(ref.current); return () => observer.disconnect(); }, []);
  return { ref, width };
}
const shortPeriod = (label: string) => `${label.slice(5)}/${label.slice(2, 4)}`;
const periodName = (label: string) => new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${label}-01T12:00:00Z`));
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function ChartModeSwitch({ value, onChange, label }: { value: ChartMode; onChange: (mode: ChartMode) => void; label: string }) {
  return <div className="chart-mode-switch" role="group" aria-label={label}>
    <button type="button" aria-pressed={value === "bar"} onClick={() => onChange("bar")}>Sloupce</button>
    <button type="button" aria-pressed={value === "line"} onClick={() => onChange("line")}>Linie</button>
  </div>;
}

function ChartTooltip({ x, width, title, lines }: { x: number; width: number; title: string; lines: string[] }) {
  const boxWidth = 190;
  const boxHeight = 30 + lines.length * 17;
  const left = clamp(x - boxWidth / 2, 5, width - boxWidth - 5);
  return <g className="chart-tooltip" role="status" aria-live="polite">
    <rect x={left} y={5} width={boxWidth} height={boxHeight} rx="8"/>
    <text x={left + 12} y={24} className="chart-tooltip-title">{title}</text>
    {lines.map((line, index) => <text key={line} x={left + 12} y={43 + index * 17}>{line}</text>)}
  </g>;
}

function linePath(values: number[], xAt: (index: number) => number, yAt: (value: number) => number) {
  return values.map((value, index) => `${index ? "L" : "M"}${xAt(index)} ${yAt(value)}`).join(" ");
}

export function CollectionChart({ data }: { data: Point[] }) {
  const [mode, setMode] = useState<ChartMode>("bar");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((point) => [point.expected, point.paid]));
  const { ref, width } = useChartWidth();
  const height = 280;
  const paddingX = 34;
  const paddingTop = 72;
  const paddingBottom = 48;
  const chartHeight = height - paddingTop - paddingBottom;
  const groupWidth = (width - paddingX * 2) / Math.max(data.length, 1);
  const barWidth = Math.max(8, Math.min(24, groupWidth * .28));
  const xAt = (index: number) => paddingX + index * groupWidth + groupWidth / 2;
  const yAt = (value: number) => paddingTop + chartHeight - value / max * chartHeight;
  const active = activeIndex === null ? null : data[activeIndex];
  return <div className="report-chart-shell" ref={ref}>
    <ChartModeSwitch value={mode} onChange={setMode} label="Podoba grafu inkasa"/>
    <div className="report-chart-wrap"><svg className="report-chart" data-chart-mode={mode} style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vývoj předpisů a úhrad">
      <line x1={paddingX} x2={width-paddingX} y1={paddingTop+chartHeight} y2={paddingTop+chartHeight} className="chart-axis"/>
      {mode === "bar" ? data.map((point,index)=>{const x=xAt(index);const expectedHeight=point.expected/max*chartHeight;const paidHeight=point.paid/max*chartHeight;return <g key={point.label}><rect className="chart-bar expected" x={x-barWidth-2} y={paddingTop+chartHeight-expectedHeight} width={barWidth} height={expectedHeight} rx="4"/><rect className="chart-bar paid" x={x+2} y={paddingTop+chartHeight-paidHeight} width={barWidth} height={paidHeight} rx="4"/></g>;}) : <>
        <path d={linePath(data.map((point) => point.expected), xAt, yAt)} className="chart-line expected"/>
        <path d={linePath(data.map((point) => point.paid), xAt, yAt)} className="chart-line paid"/>
        {data.map((point,index)=><g key={point.label}><circle className="chart-point expected" cx={xAt(index)} cy={yAt(point.expected)} r="4"/><circle className="chart-point paid" cx={xAt(index)} cy={yAt(point.paid)} r="4"/></g>)}
      </>}
      {data.map((point,index)=><g key={`hit-${point.label}`} className="chart-checkpoint" tabIndex={0} role="button" aria-label={`${periodName(point.label)}: předpis ${money(point.expected)}, uhrazeno ${money(point.paid)}`} onPointerEnter={()=>setActiveIndex(index)} onPointerLeave={()=>setActiveIndex(null)} onFocus={()=>setActiveIndex(index)} onBlur={()=>setActiveIndex(null)}><rect x={paddingX+index*groupWidth} y={paddingTop} width={groupWidth} height={chartHeight} fill="transparent"/><text className="chart-label" x={xAt(index)} y={height-25} textAnchor="middle">{(index % Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(width / 95)))) === 0 || index === data.length - 1) ? shortPeriod(point.label) : ""}</text></g>)}
      {active && <ChartTooltip x={xAt(activeIndex!)} width={width} title={periodName(active.label)} lines={[`Předpis: ${money(active.expected)}`, `Uhrazeno: ${money(active.paid)}`]}/>}
    </svg></div>
    <div className="chart-legend"><span><i className="legend-expected"/>Předpis</span><span><i className="legend-paid"/>Uhrazeno</span></div>
  </div>;
}

export function OccupancyChart({ data }: { data: OccupancyPoint[] }) {
  const [mode, setMode] = useState<ChartMode>("line");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { ref, width } = useChartWidth();
  const height = 300;
  const paddingX = 42;
  const paddingTop = 82;
  const paddingBottom = 48;
  const chartHeight = height - paddingTop - paddingBottom;
  const step = (width - paddingX * 2) / Math.max(data.length - 1, 1);
  const groupWidth = (width - paddingX * 2) / Math.max(data.length, 1);
  const xAt = (index: number) => data.length === 1 ? width / 2 : paddingX + index * step;
  const yAt = (value: number) => paddingTop + chartHeight - value / 10_000 * chartHeight;
  const coordinates = data.map((point, index) => point.occupancyBps === null ? null : { x: xAt(index), y: yAt(point.occupancyBps) });
  const segments: string[] = [];
  let current = "";
  coordinates.forEach((point) => {
    if (!point) { if (current) segments.push(current); current = ""; return; }
    current += `${current ? " L" : "M"}${point.x} ${point.y}`;
  });
  if (current) segments.push(current);
  const active = activeIndex === null ? null : data[activeIndex];
  return <div className="report-chart-shell" ref={ref}>
    <ChartModeSwitch value={mode} onChange={setMode} label="Podoba grafu obsazenosti"/>
    <div className="report-chart-wrap"><svg className="report-chart occupancy-chart" data-chart-mode={mode} style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historický vývoj obsazenosti">
      {[0, 50, 100].map((value) => { const y = yAt(value * 100); return <g key={value}><line x1={paddingX} x2={width-paddingX} y1={y} y2={y} className="chart-grid"/><text x={paddingX-8} y={y+4} textAnchor="end" className="chart-scale">{`${value}%`}</text></g>; })}
      {mode === "line" ? <>{segments.map((path, index) => <path key={index} d={path} className="occupancy-line"/>)}{data.map((point,index)=>{const coordinate=coordinates[index],x=xAt(index);return coordinate?<circle key={point.label} className="occupancy-point" cx={coordinate.x} cy={coordinate.y} r="5"/>:<circle key={point.label} className="occupancy-point missing" cx={x} cy={paddingTop+chartHeight} r="4"/>;})}</> : data.map((point,index)=>{const x=xAt(index);if(point.occupancyBps===null)return <circle key={point.label} className="occupancy-point missing" cx={x} cy={paddingTop+chartHeight} r="4"/>;const barHeight=point.occupancyBps/10_000*chartHeight;return <rect key={point.label} className="occupancy-bar" x={x-12} y={paddingTop+chartHeight-barHeight} width="24" height={barHeight} rx="5"/>;})}
      {data.map((point,index)=>{const x=xAt(index);return <g key={`hit-${point.label}`} className="chart-checkpoint" tabIndex={0} role="button" aria-label={point.occupancyBps===null?`${periodName(point.label)}: bez průkazných dat`:`${periodName(point.label)}: obsazenost ${(point.occupancyBps/100).toFixed(1)} procent`} onPointerEnter={()=>setActiveIndex(index)} onPointerLeave={()=>setActiveIndex(null)} onFocus={()=>setActiveIndex(index)} onBlur={()=>setActiveIndex(null)}><rect x={data.length===1?paddingX:x-groupWidth/2} y={paddingTop} width={groupWidth} height={chartHeight} fill="transparent"/><text className="chart-label" x={x} y={height-25} textAnchor="middle">{(index % Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(width / 95)))) === 0 || index === data.length - 1) ? shortPeriod(point.label) : ""}</text></g>;})}
      {active && <ChartTooltip x={xAt(activeIndex!)} width={width} title={periodName(active.label)} lines={active.occupancyBps === null ? ["Bez průkazných dat", `Neznámé jednotky: ${active.unknown}`] : [`Obsazenost: ${(active.occupancyBps / 100).toFixed(1)} %`, `Obsazeno: ${active.occupied} / ${active.rentable}`, `Volné: ${active.vacant}`]}/>}
    </svg></div>
    <div className="chart-legend"><span><i className="legend-occupancy"/>Obsazenost</span><span><i className="legend-missing"/>Chybějící historie</span></div>
  </div>;
}

const expiryStrategyLabel = (event: RentForecastExpiryEvent) => event.strategy === "RELET" ? `Přeobsadit${event.vacancyMonths ? ` · vacancy ${event.vacancyMonths} m` : ""}` : event.strategy === "RENEW_TARGET_MF" ? "Prodloužit · cíl dle MF" : event.strategy === "RENEW_CUSTOM" ? "Prodloužit · vlastní nájem" : "Prodloužit · automaticky";
const expiryDateLabel = (value: string) => new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));

export function RentForecastChart({ data, mfPeriod, expiryEvents = [] }: { data: ForecastPoint[]; mfPeriod?: string; expiryEvents?: RentForecastExpiryEvent[] }) {
  const [showMf, setShowMf] = useState(true);
  const [annual, setAnnual] = useState(true);
  const long = data.length > 60;
  // Annual view samples month-end run rates, never annual sums on a Kč/month axis.
  const points = long && annual ? data.filter((_, index) => index === 0 || (index + 1) % 12 === 0 || index === data.length - 1) : data;
  const series = [{ label: "Smluvní vývoj", color: "#8299b7", dashed: true }, { label: "Plán scénáře", color: "#1769e0" }, { label: "Očekávané inkaso", color: "#2f9f72" }, ...(showMf ? [{ label: "Tržní nájemné · MF odhad", color: "#9b59b6", dashed: true }] : [])];
  const groupedMarkers = new Map<string, RentForecastExpiryEvent[]>();
  for (const event of expiryEvents) {
    const point = points.find(item => item.period >= event.period) ?? points.at(-1);
    if (!point) continue;
    groupedMarkers.set(point.period, [...(groupedMarkers.get(point.period) ?? []), event]);
  }
  const markers = [...groupedMarkers].map(([period,events]) => {
    const point = points.find(item => item.period === period)!;
    const impact = events.reduce((sum,event)=>sum+event.impactCents,0);
    const relets = events.filter(event=>event.strategy==="RELET").length;
    const lines = [`Dopad headline rentu: ${impact>=0?"+":""}${money(impact)} / měsíc${relets?` · přeobsazení ${relets}`:""}`];
    for (const event of events) lines.push(`${expiryDateLabel(event.expiryDate)} · ${event.propertyName} · ${event.unitLabel} — ${expiryStrategyLabel(event)}`, `${money(event.previousRentCents)} → ${money(event.newRentCents)} · MF ${event.marketRentCents==null?"bez podkladu":money(event.marketRentCents)}`);
    return { period, title: events.length===1?`Expirace · ${expiryDateLabel(events[0].expiryDate)}`:`${period} · ${events.length} expirace`, count: events.length, value: point.plannedCents, lines };
  });
  return <div className="rent-forecast-chart">
    <div className="financial-chart-controls"><div role="group" aria-label="Ukazatele scénáře"><button type="button" aria-pressed={showMf} onClick={() => setShowMf(!showMf)}>MF</button></div>{long && <div role="group" aria-label="Podrobnost scénáře"><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>Po letech</button><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>Po měsících</button></div>}</div>
    {showMf && <p className="muted-copy">MF reference: {mfPeriod ?? "uložený podklad"}. Budoucí vývoj je vlastní scénář, nikoli prognóza MF. {data.some(row => row.mfProjectedCents == null) && "Pro celý rozsah chybí úplné MF pokrytí; tržní čára se nezobrazuje. Podklady jednotlivých jednotek najdete níže."}</p>}
    {long && <p className="muted-copy">Dlouhodobá simulace je hrubý odhad s rostoucí nejistotou. {annual && "Body po letech ukazují měsíční nájemné na konci každých 12 měsíců, nikoli roční součet."}</p>}
    <FinancialTrendChart title="Scénář valorizace a očekávaného inkasa" rows={points.map(point => ({ label: point.period, values: [point.contractualCents, point.plannedCents, point.expectedCollectedCents, ...(showMf ? [point.mfProjectedCents ?? null] : [])] }))} series={series} markers={markers} percent detail pointClass="forecast-point"/>
  </div>;
}
