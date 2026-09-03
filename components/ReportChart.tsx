"use client";

import { useState } from "react";
import { money } from "@/lib/format";

type Point = { label: string; expected: number; paid: number };
type OccupancyPoint = { label: string; occupancyBps: number | null; rentable: number; occupied: number; vacant: number; unknown: number };
type ChartMode = "bar" | "line";

const chartWidth = (length: number) => Math.max(840, length * 64);
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
  const width = chartWidth(data.length);
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
  return <div className="report-chart-shell">
    <ChartModeSwitch value={mode} onChange={setMode} label="Podoba grafu inkasa"/>
    <div className="report-chart-wrap"><svg className="report-chart" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vývoj předpisů a úhrad">
      <line x1={paddingX} x2={width-paddingX} y1={paddingTop+chartHeight} y2={paddingTop+chartHeight} className="chart-axis"/>
      {mode === "bar" ? data.map((point,index)=>{const x=xAt(index);const expectedHeight=point.expected/max*chartHeight;const paidHeight=point.paid/max*chartHeight;return <g key={point.label}><rect className="chart-bar expected" x={x-barWidth-2} y={paddingTop+chartHeight-expectedHeight} width={barWidth} height={expectedHeight} rx="4"/><rect className="chart-bar paid" x={x+2} y={paddingTop+chartHeight-paidHeight} width={barWidth} height={paidHeight} rx="4"/></g>;}) : <>
        <path d={linePath(data.map((point) => point.expected), xAt, yAt)} className="chart-line expected"/>
        <path d={linePath(data.map((point) => point.paid), xAt, yAt)} className="chart-line paid"/>
        {data.map((point,index)=><g key={point.label}><circle className="chart-point expected" cx={xAt(index)} cy={yAt(point.expected)} r="4"/><circle className="chart-point paid" cx={xAt(index)} cy={yAt(point.paid)} r="4"/></g>)}
      </>}
      {data.map((point,index)=><g key={`hit-${point.label}`} className="chart-checkpoint" tabIndex={0} role="button" aria-label={`${periodName(point.label)}: předpis ${money(point.expected)}, uhrazeno ${money(point.paid)}`} onPointerEnter={()=>setActiveIndex(index)} onPointerLeave={()=>setActiveIndex(null)} onFocus={()=>setActiveIndex(index)} onBlur={()=>setActiveIndex(null)}><rect x={paddingX+index*groupWidth} y={paddingTop} width={groupWidth} height={chartHeight} fill="transparent"/><text className="chart-label" x={xAt(index)} y={height-25} textAnchor="middle">{shortPeriod(point.label)}</text></g>)}
      {active && <ChartTooltip x={xAt(activeIndex!)} width={width} title={periodName(active.label)} lines={[`Předpis: ${money(active.expected)}`, `Uhrazeno: ${money(active.paid)}`]}/>}
    </svg></div>
    <div className="chart-legend"><span><i className="legend-expected"/>Předpis</span><span><i className="legend-paid"/>Uhrazeno</span></div>
  </div>;
}

export function OccupancyChart({ data }: { data: OccupancyPoint[] }) {
  const [mode, setMode] = useState<ChartMode>("line");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = chartWidth(data.length);
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
  return <div className="report-chart-shell">
    <ChartModeSwitch value={mode} onChange={setMode} label="Podoba grafu obsazenosti"/>
    <div className="report-chart-wrap"><svg className="report-chart occupancy-chart" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historický vývoj obsazenosti">
      {[0, 50, 100].map((value) => { const y = yAt(value * 100); return <g key={value}><line x1={paddingX} x2={width-paddingX} y1={y} y2={y} className="chart-grid"/><text x={paddingX-8} y={y+4} textAnchor="end" className="chart-scale">{`${value}%`}</text></g>; })}
      {mode === "line" ? <>{segments.map((path, index) => <path key={index} d={path} className="occupancy-line"/>)}{data.map((point,index)=>{const coordinate=coordinates[index],x=xAt(index);return coordinate?<circle key={point.label} className="occupancy-point" cx={coordinate.x} cy={coordinate.y} r="5"/>:<circle key={point.label} className="occupancy-point missing" cx={x} cy={paddingTop+chartHeight} r="4"/>;})}</> : data.map((point,index)=>{const x=xAt(index);if(point.occupancyBps===null)return <circle key={point.label} className="occupancy-point missing" cx={x} cy={paddingTop+chartHeight} r="4"/>;const barHeight=point.occupancyBps/10_000*chartHeight;return <rect key={point.label} className="occupancy-bar" x={x-12} y={paddingTop+chartHeight-barHeight} width="24" height={barHeight} rx="5"/>;})}
      {data.map((point,index)=>{const x=xAt(index);return <g key={`hit-${point.label}`} className="chart-checkpoint" tabIndex={0} role="button" aria-label={point.occupancyBps===null?`${periodName(point.label)}: bez průkazných dat`:`${periodName(point.label)}: obsazenost ${(point.occupancyBps/100).toFixed(1)} procent`} onPointerEnter={()=>setActiveIndex(index)} onPointerLeave={()=>setActiveIndex(null)} onFocus={()=>setActiveIndex(index)} onBlur={()=>setActiveIndex(null)}><rect x={data.length===1?paddingX:x-groupWidth/2} y={paddingTop} width={groupWidth} height={chartHeight} fill="transparent"/><text className="chart-label" x={x} y={height-25} textAnchor="middle">{shortPeriod(point.label)}</text></g>;})}
      {active && <ChartTooltip x={xAt(activeIndex!)} width={width} title={periodName(active.label)} lines={active.occupancyBps === null ? ["Bez průkazných dat", `Neznámé jednotky: ${active.unknown}`] : [`Obsazenost: ${(active.occupancyBps / 100).toFixed(1)} %`, `Obsazeno: ${active.occupied} / ${active.rentable}`, `Volné: ${active.vacant}`]}/>}
    </svg></div>
    <div className="chart-legend"><span><i className="legend-occupancy"/>Obsazenost</span><span><i className="legend-missing"/>Chybějící historie</span></div>
  </div>;
}
