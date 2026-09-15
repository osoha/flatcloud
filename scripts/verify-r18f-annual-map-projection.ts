import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { FrozenAnnualReportPdfData } from "../lib/reporting/pdf/annual-report-pdf-data";
import { annualMapPdfPoint, czechMapPoint } from "../lib/reporting/annual-map-projection";

async function main() {
const near = (actual: number, expected: number, tolerance = 0.012) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not near ${expected}`);

for (const city of [
  { name: "Brno", lat: 49.1951, lon: 16.6068, x: 0.655, y: 0.741 },
  { name: "Plzeň", lat: 49.7384, lon: 13.3736, x: 0.183, y: 0.518 },
  { name: "Ústí nad Labem", lat: 50.6611, lon: 14.0323, x: 0.283, y: 0.156 },
  { name: "Ostrava", lat: 49.8209, lon: 18.2625, x: 0.900, y: 0.499 },
]) {
  const point = czechMapPoint(city.lat, city.lon); near(point.x, city.x); near(point.y, city.y);
}

const brno = annualMapPdfPoint(49.1951, 16.6068);
near(brno.x, 495.8, 1); near(brno.y, 250.1, 1);

const renderer = readFileSync("lib/reporting/pdf/annual-report-pdf.tsx", "utf8");
assert.match(renderer, /annualMapPdfPoint/);
assert.doesNotMatch(renderer, /193 \+ point\.x \* 438|66 \+ point\.y \* 222/);
for (const marker of ["0.14649689612230307", "0.3943046083477732", "left: 175, top: 44, width: 490, height: 278"]) assert.match(renderer, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

if (process.env.R18F_PREVIEW) {
  const property = { propertyName: "UX Audit – Rezidence Javorová", propertyAddress: "Javorová 10, 602 00 Brno", openingValueCents: BigInt(5_000_000_000), currentValueCents: BigInt(6_000_000_000), targetValueCents: BigInt(7_500_000_000), realizedExitProceedsCents: BigInt(0), plannedExitProceedsCents: BigInt(7_500_000_000), plannedExitYear: 2027, investmentCase: "Aktivní správa.", valueCreationNarrative: "Obnova objektu.", outlook: "Další rozvoj.", sourceNote: "Interní valuace.", mapLatitude: 49.1951, mapLongitude: 16.6068, mapLabel: "UX Audit – Rezidence Javorová", mapCardSide: "AUTO", mapPhotoDataUrl: null, snapshot: { revision: 1, source: "CALCULATED" as const, schemaVersion: 1, calculatorVersion: "r18f", sourceNote: null, fingerprint: "b".repeat(64) } };
  const data: FrozenAnnualReportPdfData = { reportingGroupName: "FlatCloud", year: 2026, revision: 1, asOfDate: new Date("2026-12-31T12:00:00Z"), founderLetter: "Slovo zakladatele", executiveSummary: "Shrnutí", investmentThesis: "Teze", valueCreationSummary: "Tvorba hodnoty", outlook: "Výhled", grossAssetValueCents: BigInt(6_000_000_000), netAssetValueCents: BigInt(4_000_000_000), debtCents: BigInt(2_000_000_000), targetPortfolioValueCents: BigInt(7_500_000_000), realizedExitProceedsCents: BigInt(0), plannedExitProceedsCents: BigInt(7_500_000_000), issuedShares: 1000, treasuryShares: 0, sharePriceCents: BigInt(4_000_000), team: [{ sourceUserId: null, name: "Ondřej Šohaj", role: "Řízení realizace a správy", email: "", photoDataUrl: null }], groupStructure: { parent: { name: "FlatCloud a.s.", type: "holdingová společnost", ico: "", address: "", leadership: "" }, subsidiaries: [] }, contact: { companyName: "FlatCloud a.s.", registeredAddress: "", officeAddress: "", phone: "", email: "info@flatcloud.cz", dataBox: "", boardMembers: "", investmentCommittee: "", confidentialityNotice: "Důvěrný dokument.", investmentDisclaimer: "Nejde o veřejnou nabídku." }, properties: [property] };
  const { renderAnnualReportPdf } = await import("../lib/reporting/pdf/annual-report-pdf");
  mkdirSync("tmp/pdfs/r18f", { recursive: true }); writeFileSync("tmp/pdfs/r18f/brno-map.pdf", await renderAnnualReportPdf(data));
}

console.log("R18F annual map projection verifier passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
