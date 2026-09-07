export type AnnualQuarterlyAlignmentStatus = "ALIGNED" | "NO_PUBLISHED_Q4" | "DATE_MISMATCH" | "SCOPE_MISMATCH" | "DATE_AND_SCOPE_MISMATCH";

type PublishedQ4 = { id: string; revision: number; asOfDate: Date; propertyIds: string[] };

export function annualQuarterlyAlignment(input: { annualAsOfDate: Date; annualPropertyIds: string[]; publishedQ4: PublishedQ4 | null }) {
  if (!input.publishedQ4) return { status: "NO_PUBLISHED_Q4" as const, dateMatches: false, scopeMatches: false, missingInQ4: [...input.annualPropertyIds].sort(), extraInQ4: [] as string[] };
  const annualIds = new Set(input.annualPropertyIds), q4Ids = new Set(input.publishedQ4.propertyIds);
  const missingInQ4 = [...annualIds].filter((id) => !q4Ids.has(id)).sort();
  const extraInQ4 = [...q4Ids].filter((id) => !annualIds.has(id)).sort();
  const dateMatches = input.annualAsOfDate.getTime() === input.publishedQ4.asOfDate.getTime();
  const scopeMatches = missingInQ4.length === 0 && extraInQ4.length === 0;
  const status: AnnualQuarterlyAlignmentStatus = dateMatches
    ? scopeMatches ? "ALIGNED" : "SCOPE_MISMATCH"
    : scopeMatches ? "DATE_MISMATCH" : "DATE_AND_SCOPE_MISMATCH";
  return { status, dateMatches, scopeMatches, missingInQ4, extraInQ4 };
}
