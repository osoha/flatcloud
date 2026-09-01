import type { QuarterlyPropertyPresentation } from "../quarterly-property-presentation-model";

export const PDF_TECHNICAL_CELLS_PER_PAGE = 9;
export const PDF_VALUATION_ROWS_PER_PAGE = 12;
const OVERVIEW_LINES_PER_PAGE = 25;
const NARRATIVE_LINES_PER_PAGE = 27;
const CHARS_PER_LINE = 92;

export type QuarterlyPropertyPdfPage =
  | { kind: "COVER" }
  | { kind: "OVERVIEW"; continuation: number; content: string }
  | { kind: "TECHNICAL"; continuation: number; sections: QuarterlyPropertyPresentation["technicalSections"] }
  | { kind: "VALUATION"; continuation: number; rows: QuarterlyPropertyPresentation["valuationRows"]; final: boolean }
  | { kind: "TRENDS" }
  | { kind: "ADDITIONAL_COMMENTARY"; continuation: number; content: string };

function wrappedLines(value: string, width = CHARS_PER_LINE) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const lines: string[] = [];
  for (const paragraphLine of normalized.split("\n")) {
    if (!paragraphLine.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraphLine.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && next.length > width) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function paginatePdfNarrative(value: string | null | undefined, linesPerPage = NARRATIVE_LINES_PER_PAGE) {
  const lines = wrappedLines(value || "");
  return Array.from({ length: Math.ceil(lines.length / linesPerPage) }, (_, index) =>
    lines.slice(index * linesPerPage, (index + 1) * linesPerPage).join("\n"),
  );
}

function paginateTechnical(model: QuarterlyPropertyPresentation) {
  const cells: QuarterlyPropertyPresentation["technicalSections"] = [];
  for (const section of model.technicalSections) {
    const parts = paginatePdfNarrative(section.commentary, 7);
    (parts.length ? parts : [""]).forEach((commentary, index) => cells.push({
      ...section,
      title: index ? `${section.title} · pokračování ${index + 1}` : section.title,
      commentary,
    }));
  }
  if (!cells.length) return [[]];
  return Array.from({ length: Math.ceil(cells.length / PDF_TECHNICAL_CELLS_PER_PAGE) }, (_, index) =>
    cells.slice(index * PDF_TECHNICAL_CELLS_PER_PAGE, (index + 1) * PDF_TECHNICAL_CELLS_PER_PAGE),
  );
}

export function buildQuarterlyPropertyPdfPagePlan(model: QuarterlyPropertyPresentation): QuarterlyPropertyPdfPage[] {
  const overview = paginatePdfNarrative(model.managementCommentary || "Bez komentáře.", OVERVIEW_LINES_PER_PAGE);
  const technical = paginateTechnical(model);
  const valuation = model.valuationRows.length
    ? Array.from({ length: Math.ceil(model.valuationRows.length / PDF_VALUATION_ROWS_PER_PAGE) }, (_, index) => model.valuationRows.slice(index * PDF_VALUATION_ROWS_PER_PAGE, (index + 1) * PDF_VALUATION_ROWS_PER_PAGE))
    : [[]];
  const additional = paginatePdfNarrative(model.additionalCommentary);
  return [
    { kind: "COVER" },
    ...overview.map((content, index) => ({ kind: "OVERVIEW" as const, continuation: index + 1, content })),
    ...technical.map((sections, index) => ({ kind: "TECHNICAL" as const, continuation: index + 1, sections })),
    ...valuation.map((rows, index) => ({ kind: "VALUATION" as const, continuation: index + 1, rows, final: index === valuation.length - 1 })),
    { kind: "TRENDS" },
    ...additional.map((content, index) => ({ kind: "ADDITIONAL_COMMENTARY" as const, continuation: index + 1, content })),
  ];
}
