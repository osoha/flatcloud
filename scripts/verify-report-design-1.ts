import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file: string) => createHash("sha256").update(read(file)).digest("hex");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

const page = read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx");
const nav = read("components/quarterly-report-workspace/QuarterlyReportWorkspaceNav.tsx");
const overview = read("components/quarterly-report-workspace/QuarterlyReportQuarterOverview.tsx");
const property = read("components/quarterly-report-workspace/QuarterlyReportPropertyWorkspace.tsx");
const editor = read("components/QuarterlyPropertyEditorialEditor.tsx");
const dataPanel = read("components/quarterly-report-workspace/QuarterlyReportDataPanel.tsx");
const review = read("components/quarterly-report-workspace/QuarterlyReportReviewExport.tsx");
const contentRoute = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/content/route.ts");
const ci = read(".github/workflows/ci.yml");

check("property-centric workspace navigation exists", () => { assert.match(page, /QuarterlyReportWorkspaceNav/); assert.match(nav, /Přehled kvartálu/); assert.match(nav, /Nemovitosti/); assert.match(nav, /Kontrola a export/); });
check("report-period overview remains an internal coordination view", () => { assert.match(overview, /Interní přehled přípravy/); assert.match(overview, /Nejde o investor-facing portfolio souhrn/); });
check("properties are independently addressable", () => assert.match(nav, /propertyId=\$\{encodeURIComponent\(property\.propertyId\)\}/));
check("only the selected property is the primary editor", () => { assert.match(page, /activeSection === "property" && active/); assert.doesNotMatch(page, /propertyReports\.map[\s\S]{0,300}QuarterlyPropertyEditorialEditor/); });
check("previous and next property navigation exists", () => { assert.match(property, /previous/); assert.match(property, /next/); assert.match(property, /quarterly-property-pager/); });
check("frozen property identity drives navigation and workspace", () => { assert.match(page, /propertyNameSnapshot/); assert.match(page, /propertyAddressSnapshot/); assert.doesNotMatch(page, /property:\s*\{\s*select:\s*\{\s*name/); });
check("executiveSummary storage and editing compatibility remains", () => { assert.match(page, /executiveSummary/); assert.match(page, /\/editorial/); assert.match(overview, /Interní shrnutí reportovacího období/); });
check("existing property content form contract remains", () => { for (const field of ["propertyStatus", "managementCommentary", "technicalSections", "valuationRows"]) assert.ok(editor.includes(field)); assert.match(contentRoute, /quarterlyPropertyReportContentSchema\.parse/); });
check("technicalSections serialization remains", () => assert.match(editor, /name="technicalSections" value=\{JSON\.stringify\(technicalSections\)\}/));
check("valuationRows serialization remains", () => assert.match(editor, /name="valuationRows" value=\{JSON\.stringify\(\[\.\.\.legacyValuationRows, \.\.\.unitValuationRows\]\)\}/));
check("legacy valuations remain read-only and compatible", () => { assert.match(editor, /Starší formát ocenění/); assert.match(editor, /zůstávají beze změny kvůli kompatibilitě/); assert.match(property, /legacyRows/); });
check("operational KPI preview reads the selected existing snapshot", () => { assert.match(page, /quarterSnapshotDataSchema\.safeParse\(row\.snapshot\.data\)/); for (const section of ["units", "rentRoll", "collections", "deposits", "leases"]) assert.ok(property.includes(`data.${section}`)); });
check("no annual or investment KPI logic was introduced", () => assert.doesNotMatch(page + property, /portfolio NAV|share price|shareholder return|projected portfolio exit|value growth|exit value/i));
check("snapshot controls remain DRAFT-only", () => { assert.match(page, /report\.status === "DRAFT" && propertyIds\.length/); assert.match(page, /editable=\{report\.status === "DRAFT"\}/); assert.match(dataPanel, /editable &&/); });
check("data provenance is secondary and collapsible", () => { assert.match(dataPanel, /<details/); assert.match(dataPanel, /Data a snapshot/); assert.match(dataPanel, /schemaVersion/); assert.match(dataPanel, /calculatorVersion/); });
check("Review and Export workspace exists", () => { assert.match(page, /QuarterlyReportReviewExport/); assert.match(review, /Kontrola a export/); });
check("warning acknowledgement remains", () => { assert.match(review, /acknowledge-warnings/); assert.match(page, /REPORT_WARNINGS_ACKNOWLEDGED/); });
check("publish, return-to-draft, and correction controls remain", () => { for (const action of ["publish", "return-draft", "create-correction"]) assert.ok(review.includes(`value="${action}"`)); });
check("existing PDF controls remain", () => { for (const token of ["assets/preview", "assets/download", "assets/generate"]) assert.ok(review.includes(token)); });
check("dirty-state protects controlled editor navigation and unload", () => { assert.match(editor, /beforeunload/); assert.match(editor, /window\.confirm/); assert.match(editor, /JSON\.stringify\(technicalSections\)/); assert.match(editor, /JSON\.stringify\(unitValuationRows\)/); assert.match(editor, /submitting\.current/); });
check("no autosave was introduced", () => assert.doesNotMatch(editor + property, /autosave|autoSave|setInterval|fetch\(/));
check("completion is derived display state and not a new publish blocker", () => { assert.match(page, /function completionState/); assert.match(review, /nezavádí nový publikační blokátor/); assert.doesNotMatch(read("lib/reporting/quarterly-report-service.ts"), /editorial-sparse|required-incomplete/); });
check("REPORT-DESIGN-1 introduced no schema fields or migration of its own", () => { assert.doesNotMatch(read("prisma/schema.prisma"), /QuarterlyReportWorkspace|completionState/); assert.equal(fs.readdirSync(path.join(root, "prisma/migrations")).filter((name) => /report.design.1/i.test(name)).length, 0); });
check("editorial and PDF contracts remain unchanged while later manual-baseline schema evolution is allowed", () => { assert.equal(hash("lib/reporting/editorial-schema.ts"), "1e79b34172eddba838e2bf2beb6ca2867f17ce8803b6f5e67a764294333c609c"); assert.match(read("lib/reporting/snapshot-schema.ts"), /manualBaselineSnapshotDataSchema/); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf.tsx"), "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff"); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"), "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b"); });
check("reporting access, workflow, and quality rules remain protected", () => { assert.equal(hash("lib/reporting/backoffice-access.ts"), "fc9dca56b004f44a663f225f03974fca8926dc5520d425640f4339eac5e39ca0"); assert.equal(hash("lib/reporting/quarterly-quality-gate.ts"), "bee943a48d16afe527c3f9340947821022d98794066134ff7783dea3d2f4fcf1"); const service = read("lib/reporting/quarterly-report-service.ts"); for (const token of ["submitQuarterlyReportForReview", "returnQuarterlyReportToDraft", "publishQuarterlyReport", "createCorrectionRevision"]) assert.ok(service.includes(token)); const design4a=ci.indexOf("npm run verify:report-design-4a"),trends1=ci.indexOf("npm run verify:report-trends-1"),build=ci.indexOf("npm run build");assert.ok(design4a<trends1&&trends1<build); });

console.log(`REPORT-DESIGN-1 verification passed: ${count} checks.`);
