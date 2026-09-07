import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import type { FrozenAnnualReportPdfData } from "../lib/reporting/pdf/annual-report-pdf-data";
import { czechMapPoint, geocodeCzechAddress } from "../lib/reporting/annual-map";

const read = (path: string) => readFileSync(path, "utf8"); let passed = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); passed += 1; console.log(`✓ ${name}`); }

async function main() {
await check("annual editor exposes map, team, structure, contacts and legal copy", () => {
  const page = read("app/reporty/vyrocni/[groupId]/reporty/[reportId]/page.tsx"); const editor = read("components/annual-report/AnnualCorporateSectionsEditor.tsx"); const route = read("app/api/reporting-groups/[groupId]/annual-reports/[reportId]/corporate-sections/route.ts");
  for (const marker of ["Mapa portfolia", "Tým a skupina", "Doplnit chybějící polohy z adres", "Nahrát fotografii"]) assert.match(page, new RegExp(marker));
  for (const marker of ["Tým", "Struktura skupiny", "Kontakty a poučení", "Poučení o důvěrnosti", "Investiční výbor"]) assert.match(editor, new RegExp(marker));
  for (const field of ["parent.type", "parent.ico", "parent.address", "parent.leadership"]) assert.match(route, new RegExp(`text\\(form, "${field.replace(".", "\\.")}"\\) \\|\\| ""`));
});

await check("geocoding is user-triggered, Czech-scoped, identified and persisted separately from rendering", async () => {
  const result = await geocodeCzechAddress("Moskevská 1575/24, Ústí nad Labem", async (input, init) => { const url = new URL(String(input)); assert.equal(url.searchParams.get("countrycodes"), "cz"); assert.match(String(init?.headers && (init.headers as Record<string,string>)["user-agent"]), /FlatCloud/); return new Response(JSON.stringify([{ lat: "50.661", lon: "14.043", display_name: "Moskevská" }]), { status: 200 }); });
  assert.deepEqual(result, { latitude: 50.661, longitude: 14.043, displayName: "Moskevská" });
  assert.deepEqual(czechMapPoint(90, 200), { x: 1, y: 0 });
  assert.doesNotMatch(read("lib/reporting/pdf/annual-report-pdf.tsx"), /geocodeCzechAddress|fetch\(/);
});

await check("schema and correction revisions preserve frozen appendix, coordinates and photos", () => {
  const schema = read("prisma/schema.prisma"); const service = read("lib/reporting/annual-report-service.ts");
  for (const marker of ["teamSnapshot", "groupStructureSnapshot", "contactSnapshot", "mapLatitude", "mapLongitude", "mapPhotoData"]) { assert.match(schema, new RegExp(marker)); assert.match(service, new RegExp(marker)); }
  assert.match(service, /ANNUAL_REPORT_CORPORATE_SECTIONS_UPDATED/); assert.match(service, /ANNUAL_REPORT_MAP_UPDATED/);
});

await check("expanded PDF renders all corporate chapters on the FlatCloud 13:9 master", async () => {
  const { renderAnnualReportPdf } = await import("../lib/reporting/pdf/annual-report-pdf");
  const property = (propertyName: string, propertyAddress: string, latitude: number, longitude: number) => ({ propertyName, propertyAddress, openingValueCents: BigInt(20_000_000_00), currentValueCents: BigInt(24_000_000_00), targetValueCents: BigInt(30_000_000_00), realizedExitProceedsCents: BigInt(0), plannedExitProceedsCents: BigInt(30_000_000_00), plannedExitYear: 2027, investmentCase: "Dlouhodobá aktivní správa.", valueCreationNarrative: "Rekonstrukce a růst nájemného.", outlook: "Dokončení revitalizace.", sourceNote: "Interní valuace.", mapLatitude: latitude, mapLongitude: longitude, mapLabel: propertyName, mapCardSide: "AUTO", mapPhotoDataUrl: null, snapshot: { revision: 1, source: "CALCULATED" as const, schemaVersion: 1, calculatorVersion: "r18d", sourceNote: null, fingerprint: "a".repeat(64) } });
  const data: FrozenAnnualReportPdfData = { reportingGroupName: "FlatCloud", year: 2025, revision: 1, asOfDate: new Date("2025-12-31T12:00:00Z"), founderLetter: "Slovo zakladatele", executiveSummary: "Shrnutí roku", investmentThesis: "Investiční teze", valueCreationSummary: "Tvorba hodnoty", outlook: "Výhled", grossAssetValueCents: BigInt(80_000_000_00), netAssetValueCents: BigInt(50_000_000_00), debtCents: BigInt(30_000_000_00), targetPortfolioValueCents: BigInt(100_000_000_00), realizedExitProceedsCents: BigInt(0), plannedExitProceedsCents: BigInt(100_000_000_00), issuedShares: 1000, treasuryShares: 0, sharePriceCents: BigInt(50_000_00), team: [{ sourceUserId: null, name: "Ing.arch. Ondřej Šohaj", role: "Řízení realizace a správy", email: "ondrej.sohaj@flatcloud.cz", photoDataUrl: null }], groupStructure: { parent: { name: "FlatCloud a.s.", type: "holdingová společnost", ico: "23111780", address: "Plzeň", leadership: "Správní rada" }, subsidiaries: [{ name: "BD Karla Aksamita s.r.o.", type: "SPV", ico: "22398325", address: "Plzeň", leadership: "Ondřej Šohaj" }] }, contact: { companyName: "FlatCloud a.s.", registeredAddress: "Plzeň", officeAddress: "Plzeň", phone: "605 525 606", email: "info@flatcloud.cz", dataBox: "wmmvj4g", boardMembers: "Správní rada", investmentCommittee: "Investiční výbor", confidentialityNotice: "Důvěrný akcionářský dokument.", investmentDisclaimer: "Tento dokument neslouží jako veřejná nabídka k investici." }, properties: [property("Byty Moskevská", "Ústí nad Labem", 50.661, 14.043), property("BD Karla Aksamita", "Teplice", 50.64, 13.82), property("BD Božkovská", "Plzeň", 49.73, 13.39)] };
  const pdf = await renderAnnualReportPdf(data); if (process.env.R18D_PREVIEW) { mkdirSync("tmp/pdfs/r18d", { recursive: true }); writeFileSync("tmp/pdfs/r18d/annual-report-r18d.pdf", pdf); } const document = await PDFDocument.load(pdf); assert.equal(document.getPageCount(), 12); for (const page of document.getPages()) assert.deepEqual(page.getSize(), { width: 780, height: 540 });
});

await check("R18D is wired into CI and browser smoke", () => { assert.match(read(".github/workflows/ci.yml"), /verify:r18d-annual-corporate-sections/); assert.match(read("e2e/flatcloud.smoke.spec.ts"), /Uložit tým, strukturu a kontakty/); assert.match(read("UX-REMODEL-PIPELINE.md"), /R18D implementováno/); });
console.log(`R18D verifier passed (${passed} checks).`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
