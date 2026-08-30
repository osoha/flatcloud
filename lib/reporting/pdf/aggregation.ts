export type ReportPdfNumeric = number | null | undefined;

/** Additive portfolio metrics are complete only when every frozen property value is known. */
export function aggregateKnownReportValues(values: ReportPdfNumeric[]) { return values.every((value) => value != null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null; }
