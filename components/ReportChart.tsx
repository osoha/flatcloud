import { money } from "@/lib/format";

type Point = { label: string; expected: number; paid: number };

export function CollectionChart({ data }: { data: Point[] }) {
  const max = Math.max(1, ...data.flatMap((point) => [point.expected, point.paid]));
  const width = 840;
  const height = 240;
  const paddingX = 30;
  const paddingTop = 20;
  const paddingBottom = 48;
  const chartHeight = height - paddingTop - paddingBottom;
  const groupWidth = (width - paddingX * 2) / Math.max(data.length, 1);
  const barWidth = Math.max(8, Math.min(24, groupWidth * .28));
  return <div className="report-chart-wrap"><svg className="report-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vývoj předpisů a úhrad"><line x1={paddingX} x2={width-paddingX} y1={paddingTop+chartHeight} y2={paddingTop+chartHeight} className="chart-axis"/>{data.map((point,index)=>{const x=paddingX+index*groupWidth+groupWidth/2;const expectedHeight=point.expected/max*chartHeight;const paidHeight=point.paid/max*chartHeight;return <g key={point.label}><rect className="chart-bar expected" x={x-barWidth-2} y={paddingTop+chartHeight-expectedHeight} width={barWidth} height={expectedHeight} rx="4"><title>{point.label}: předpis {money(point.expected)}</title></rect><rect className="chart-bar paid" x={x+2} y={paddingTop+chartHeight-paidHeight} width={barWidth} height={paidHeight} rx="4"><title>{point.label}: uhrazeno {money(point.paid)}</title></rect><text className="chart-label" x={x} y={height-25} textAnchor="middle">{point.label.slice(5)}</text></g>})}</svg><div className="chart-legend"><span><i className="legend-expected"/>Předpis</span><span><i className="legend-paid"/>Uhrazeno</span></div></div>;
}
