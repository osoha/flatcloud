import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { money } from "@/lib/format";
export function MetricTrend({ current, previous, unit="number", period, higherIsBetter=true }: { current:number|null;previous:number|null;unit?:"number"|"cents"|"bps";period:string;higherIsBetter?:boolean }) {
  if(current===null||previous===null)return <div className="kpi-trend"><small>Srovnání není dostupné</small></div>;
  const delta=current-previous,Icon=delta>0?TrendingUp:delta<0?TrendingDown:Minus;
  const value=unit==="cents"?money(Math.abs(delta)):unit==="bps"?`${(Math.abs(delta)/100).toLocaleString("cs-CZ",{maximumFractionDigits:1})} p. b.`:Math.abs(delta).toLocaleString("cs-CZ");
  return <div className={`kpi-trend ${delta===0?"":(delta>0)===higherIsBetter?"positive":"negative"}`}><div><Icon size={15}/> {delta>0?"+":delta<0?"−":""}{value}</div><small>oproti {period}</small></div>;
}
