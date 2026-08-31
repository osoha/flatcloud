import type { FrozenQuarterlyReportPdfData } from "./quarterly-report-pdf-data";

type ReportPeriod = Pick<FrozenQuarterlyReportPdfData, "quarter" | "year" | "revision">;

export const quarterLabel = (quarter: number) => `Q${quarter}`;
export const coverPeriodLabel = ({ quarter, year, revision }: ReportPeriod) => `${quarterLabel(quarter)} / ${year} · revize ${revision}`;
export const footerPeriodLabel = ({ quarter, year, revision }: ReportPeriod) => `FlatCloud · ${quarterLabel(quarter)} ${year} · revize ${revision}`;
