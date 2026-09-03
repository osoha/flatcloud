import { money } from "@/lib/format";

type Point = { label: string; expected: number; paid: number };
type OccupancyPoint = { label: string; occupancyBps: number | null; rentable: number; occupied: number; vacant: number; unknown: number };

const chartWidth = (length: number) => Math.max(840, length * 64);
const shortPeriod = (label: string) => `${label.slice(5)}/${label.slice(2, 4)}`;

export function CollectionChart({ data }: { data: Point[] }) {
  const max = Math.max(1, ...data.flatMap((point) => [point.expected, point.paid]));
  const width = chartWidth(data.length);
  const height = 240;
  const paddingX = 30;
  const paddingTop = 20;
  const paddingBottom = 48;
  const chartHeight = height - paddingTop - paddingBottom;
  const groupWidth = (width - paddingX * 2) / Math.max(data.length, 1);
  const barWidth = Math.max(8, Math.min(24, groupWidth * .28));
  return <div className="report-chart-wrap"><svg className="report-chart" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vývoj předpisů a úhrad"><line x1={paddingX} x2={width-paddingX} y1={paddingTop+chartHeight} y2={paddingTop+chartHeight} className="chart-axis"/>{data.map((point,index)=>{const x=paddingX+index*groupWidth+groupWidth/2;const expectedHeight=point.expected/max*chartHeight;const paidHeight=point.paid/max*chartHeight;return <g key={point.label}><rect className="chart-bar expected" x={x-barWidth-2} y={paddingTop+chartHeight-expectedHeight} width={barWidth} height={expectedHeight} rx="4"><title>{point.label}: předpis {money(point.expected)}</title></rect><rect className="chart-bar paid" x={x+2} y={paddingTop+chartHeight-paidHeight} width={barWidth} height={paidHeight} rx="4"><title>{point.label}: uhrazeno {money(point.paid)}</title></rect><text className="chart-label" x={x} y={height-25} textAnchor="middle">{shortPeriod(point.label)}</text></g>})}</svg><div className="chart-legend"><span><i className="legend-expected"/>Předpis</span><span><i className="legend-paid"/>Uhrazeno</span></div></div>;
}

export function OccupancyChart({ data }: { data: OccupancyPoint[] }) {
  const width = chartWidth(data.length);
  const height = 260;
  const paddingX = 38;
  const paddingTop = 20;
  const paddingBottom = 48;
  const chartHeight = height - paddingTop - paddingBottom;
  const step = (width - paddingX * 2) / Math.max(data.length - 1, 1);
  const xAt = (index: number) => data.length === 1 ? width / 2 : paddingX + index * step;
  const coordinates = data.map((point, index) => point.occupancyBps === null ? null : {
    x: xAt(index),
    y: paddingTop + chartHeight - point.occupancyBps / 10_000 * chartHeight,
  });
  const segments: string[] = [];
  let current = "";
  coordinates.forEach((point) => {
    if (!point) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? " L" : "M"}${point.x} ${point.y}`;
  });
  if (current) segments.push(current);
  return <div className="report-chart-wrap"><svg className="report-chart occupancy-chart" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historický vývoj obsazenosti">
    {[0, 50, 100].map((value) => { const y = paddingTop + chartHeight - value / 100 * chartHeight; return <g key={value}><line x1={paddingX} x2={width-paddingX} y1={y} y2={y} className="chart-grid"/><text x={paddingX-8} y={y+4} textAnchor="end" className="chart-scale">{value}%</text></g>; })}
    {segments.map((path, index) => <path key={index} d={path} className="occupancy-line"/>)}
    {data.map((point,index)=>{const coordinate=coordinates[index],x=xAt(index);return <g key={point.label}>{coordinate?<circle className="occupancy-point" cx={coordinate.x} cy={coordinate.y} r="5"><title>{point.label}: {(point.occupancyBps! / 100).toFixed(1)} %, {point.occupied}/{point.rentable} obsazeno</title></circle>:<circle className="occupancy-point missing" cx={x} cy={paddingTop+chartHeight} r="4"><title>{point.label}: bez průkazných dat, neznámé jednotky {point.unknown}</title></circle>}<text className="chart-label" x={x} y={height-25} textAnchor="middle">{shortPeriod(point.label)}</text></g>})}
  </svg><div className="chart-legend"><span><i className="legend-occupancy"/>Obsazenost</span><span><i className="legend-missing"/>Chybějící historie</span></div></div>;
}
