import Link from "next/link";
import type { LiveReportPeriodRange } from "@/lib/reporting/live-period";

type Props = {
  view: "occupancy" | "collections";
  range: LiveReportPeriodRange;
  properties: string | null;
};

function href(view: Props["view"], mode: "rolling12" | "ytd", properties: string | null) {
  const params = new URLSearchParams({ view });
  if (mode !== "rolling12") params.set("range", mode);
  if (properties !== null) params.set("properties", properties);
  return `/reporty?${params}`;
}

export function ReportPeriodPicker({ view, range, properties }: Props) {
  return <div className="report-period-picker" aria-label="Období grafu">
    <div className="report-period-presets">
      <Link className={range.mode === "rolling12" ? "active" : ""} href={href(view, "rolling12", properties)}>12M</Link>
      <Link className={range.mode === "ytd" ? "active" : ""} href={href(view, "ytd", properties)}>YTD</Link>
    </div>
    <form action="/reporty" method="get" className={range.mode === "custom" ? "report-period-custom active" : "report-period-custom"}>
      <input type="hidden" name="view" value={view}/>
      <input type="hidden" name="range" value="custom"/>
      {properties !== null && <input type="hidden" name="properties" value={properties}/>} 
      <label>Od <input aria-label="Období od" type="month" name="from" max={range.currentMonth} defaultValue={range.from}/></label>
      <label>Do <input aria-label="Období do" type="month" name="to" max={range.currentMonth} defaultValue={range.to}/></label>
      <button type="submit">Použít</button>
    </form>
  </div>;
}
