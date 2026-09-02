import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd(), read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file: string) => createHash("sha256").update(read(file)).digest("hex");
let count = 0;
function check(name: string, fn: () => void) { fn(); count += 1; console.log(`✓ ${count}. ${name}`); }

const routeFile = "app/reporty/kvartalni/[groupId]/reporty/[reportId]/nahled/[propertyId]/page.tsx";
const dataFile = "lib/reporting/presentation/quarterly-property-presentation-data.ts";
const modelFile = "lib/reporting/presentation/quarterly-property-presentation-model.ts";
const documentFile = "components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx";
const backgroundRouteFile = "app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/presentation/backgrounds/[role]/route.ts";

function main() {
  const route = read(routeFile), backgroundRoute = read(backgroundRouteFile), data = read(dataFile), model = read(modelFile), document = read(documentFile), css = read("app/globals.css"), workspace = read("components/quarterly-report-workspace/QuarterlyReportPropertyWorkspace.tsx");
  check("property-specific landscape preview route exists", () => { assert.ok(fs.existsSync(path.join(root, routeFile))); assert.match(route, /groupId.*reportId.*propertyId/); });
  check("reporting authentication and authorization are enforced", () => { assert.match(route, /requireUser/); assert.match(route, /backofficePermissionForGroup/); assert.match(route, /canReadReportingBackoffice/); });
  check("report, group and property membership are one scoped query", () => assert.match(data, /quarterlyReportId: input\.reportId, propertyId: input\.propertyId, quarterlyReport: \{ reportingGroupId: input\.groupId \}/));
  check("assigned design template version is loaded and required", () => { assert.match(data, /designTemplateVersion:/); assert.match(data, /QuarterlyPropertyPresentationTemplateMissing/); });
  check("template config is parsed through the RD3A schema", () => assert.match(data, /reportDesignTemplateConfigSchema\.parse\(report\.designTemplateVersion\.config\)/));
  check("all five semantic roles drive the document", () => ["COVER", "OVERVIEW", "TECHNICAL", "VALUATION", "TRENDS"].forEach((role) => assert.match(document, new RegExp(`role=\\"${role}\\"`))));
  check("background mode resolves independently by role", () => { assert.match(data, /REPORT_DESIGN_PAGE_ROLES\.map/); assert.match(document, /backgroundMode === "ASSET"/); assert.match(document, /GeneratedBackground/); });
  check("PRIMARY media powers cover", () => { assert.match(data, /role === "PRIMARY" && item\.sortOrder === 0/); assert.match(document, /model\.media\.primary/); });
  check("SECONDARY media powers overview", () => { assert.match(data, /role === "SECONDARY" && item\.sortOrder === 0/); assert.match(document, /model\.media\.supportive/); });
  check("media and backgrounds use authorized report-scoped app routes", () => { assert.match(data, /\/api\/reporting-groups\//); assert.match(data, /\/presentation\/backgrounds\//); assert.match(backgroundRoute, /currentUser/); assert.match(backgroundRoute, /backofficePermissionForGroup/); assert.match(backgroundRoute, /id: reportId, reportingGroupId: groupId/); assert.match(backgroundRoute, /quarterlyReportMediaImageResponse/); assert.doesNotMatch(data + model + document + backgroundRoute, /drive\.google|storageKey|previewStorageKey/); });
  check("editorial content enters presentation model", () => { assert.match(data, /managementCommentary: propertyReport\.managementCommentary/); assert.match(data, /technicalSections:/); assert.match(data, /valuationRows, valuationTotalCents/); });
  check("trend history delegates to the later same-property resolver", () => assert.match(data, /resolveQuarterlyPropertyTrendSeries\(\{propertyId:input\.propertyId/));
  check("current frozen snapshot is supplied to the resolver", () => assert.match(data, /currentSnapshot:propertyReport\.snapshot/));
  check("presentation loader does not invent trend periods", () => assert.doesNotMatch(data, /fillMissing|invent|interpolat/i));
  check("A4 landscape screen and print geometry are declared", () => { assert.match(css, /aspect-ratio:297\/210/); assert.match(css, /@page\{size:A4 landscape;margin:0\}/); assert.match(css, /break-after:page/); });
  check("workspace exposes the report preview action", () => { assert.match(workspace, />Náhled reportu<\/Link>/); assert.match(workspace, /previewHref/); });
  check("preview is read-only", () => { assert.doesNotMatch(route + document, /<form|method="post"|prisma\..*(create|update|delete|upsert)/); assert.match(route, /Náhled — není publikovaný dokument/); });
  check("template Prisma contract remains intact with the later nullable narrative", () => { assert.equal(hash("prisma/schema.prisma"), "fd0fc502f50fafe03e3bc65e79c62a64b6124763bce38716806384e253208a41"); assert.doesNotMatch(read(".gitignore"), /REPORT-DESIGN-3B/); });
  check("Google Drive implementation is unchanged", () => { assert.equal(hash("lib/storage/google-drive.ts"), "50d0988f0b1215fc3d0ffe13d0ed5cebbc666e31d999799cce58cc8fceb5eb4b"); assert.equal(hash("lib/storage/locations.ts"), "676e036c2fb1202650525e0e43424ae4840d16d476c0c436317d5346f8b2d9f8"); });
  check("canonical PDF renderer and loader are unchanged", () => { assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf.tsx"), "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff"); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"), "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b"); });
  check("publication and publishedAssetId paths are unchanged", () => { assert.equal(hash("lib/reporting/quarterly-report-service.ts"), "48dee570d4783869cb95211a818d5a9bd95cc51646a9ed776b84d89d02bfc151"); assert.equal(hash("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/transition/route.ts"), "d506386a28cd5867f103b27475df6cbca6e9236ac5ccd50f13d447b386dcfab9"); assert.equal(hash("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/assets/generate/route.ts"), "9af6c077a7e0cb50ef88285ff178d084a62d50f2797e7d32a39d351851172a87"); });
  check("quality/editorial contracts remain unchanged and later baseline evolution is scoped", () => { assert.match(read("lib/reporting/snapshot-schema.ts"), /manualV1[\s\S]*manualV2/); assert.equal(hash("lib/reporting/editorial-schema.ts"), "1e79b34172eddba838e2bf2beb6ca2867f17ce8803b6f5e67a764294333c609c"); assert.equal(hash("lib/reporting/quarterly-quality-gate.ts"), "bee943a48d16afe527c3f9340947821022d98794066134ff7783dea3d2f4fcf1"); });
  console.log(`REPORT-DESIGN-3B verification passed: ${count} checks.`);
}
main();
