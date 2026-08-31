import assert from "node:assert/strict";
import fs from "node:fs";
import { coverPeriodLabel, footerPeriodLabel, quarterLabel } from "../lib/reporting/pdf/period-labels";
import type { FrozenQuarterlyReportPdfData } from "../lib/reporting/pdf/quarterly-report-pdf-data";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
const read = (path: string) => fs.readFileSync(path, "utf8");

async function main() {
  const renderer = read("lib/reporting/pdf/quarterly-report-pdf.tsx");
  const period = { quarter: 3, year: 2026, revision: 2 };

  await check("quarter labels Q1 through Q4 are precomposed strings", () => {
    assert.deepEqual([1, 2, 3, 4].map(quarterLabel), ["Q1", "Q2", "Q3", "Q4"]);
  });
  await check("Q3 2026 revision 2 cover label is exact", () => {
    assert.equal(coverPeriodLabel(period), "Q3 / 2026 · revize 2");
  });
  await check("Q3 2026 revision 2 footer label is exact", () => {
    assert.equal(footerPeriodLabel(period), "FlatCloud · Q3 2026 · revize 2");
  });
  await check("cover and footer pass precomposed string labels to React-PDF Text", () => {
    assert.match(renderer, /<Text style=\{styles\.coverPeriod\}>\{coverPeriodLabel\(data\)\}<\/Text>/);
    assert.match(renderer, /<Text>\{footerPeriodLabel\(data\)\}<\/Text>/);
    assert.doesNotMatch(renderer, /<Text[^>]*>[^<\n]*Q\{data\.quarter\}/);
  });
  await check("PDF metadata title continues to use the precomposed quarter label", () => {
    assert.match(renderer, /title=\{`Kvartální report \$\{data\.reportingGroupName\} \$\{quarterLabel\(data\.quarter\)\} \$\{data\.year\}`\}/);
  });
  await check("a real Q3 PDF render has the PDF signature", async () => {
    const { renderQuarterlyReportPdf } = await import("../lib/reporting/pdf/quarterly-report-pdf");
    const data: FrozenQuarterlyReportPdfData = {
      reportingGroupName: "Testovací portfolio",
      year: 2026,
      quarter: 3,
      revision: 2,
      asOfDate: new Date("2026-09-30T00:00:00.000Z"),
      publishedAt: new Date("2026-10-01T10:00:00.000Z"),
      executiveSummary: null,
      properties: [],
    };
    const bytes = await renderQuarterlyReportPdf(data);
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
  });
  await check("A3b.3 follows A3b.2 and precedes build in CI", () => {
    assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2ba3b\n      - run: npm run verify:v22-c-part2ba3b0\n      - run: npm run verify:v22-c-part2ba3b1\n      - run: npm run verify:v22-c-part2ba3b2\n      - run: npm run verify:v22-c-part2ba3b3\n      - run: npm run build"));
  });

  console.log(`V22-C Part 2B-A3b.3 verification passed: ${count} checks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
