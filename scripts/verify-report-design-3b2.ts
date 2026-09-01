import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { flatCloudQuarterly2026Config } from "../lib/reporting/design-template-schema";

const root = process.cwd(), read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = (file: string) => digest(read(file));
const segment = (source: string, start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end));
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

function main() {
  const renderer = read("components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx"), generated = read("components/reporting/ReportDesignGeneratedBackground.tsx"), admin = read("components/reporting/ReportDesignTemplatePreview.tsx"), css = read("app/globals.css"), ci = read(".github/workflows/ci.yml");
  check("generated polygons use an explicit full-page normalized coordinate system", () => { assert.match(generated, /viewBox="0 0 1 1"/); assert.match(generated, /preserveAspectRatio="none"/); assert.match(css, /\.qpr-generated-background\{position:absolute;inset:0;[^}]*width:100%;height:100%/); });
  check("left and right lower header endpoints differ", () => { const dark = flatCloudQuarterly2026Config.contentHeader.darkPolygon, light = flatCloudQuarterly2026Config.contentHeader.lightPolygon; assert.equal(dark[3][1], .256); assert.equal(light[2][1], .139); assert.notEqual(dark[3][1], light[2][1]); });
  check("lower boundary cannot collapse to a horizontal header line", () => { const lowerY = [flatCloudQuarterly2026Config.contentHeader.darkPolygon[3][1], flatCloudQuarterly2026Config.contentHeader.darkPolygon[2][1], flatCloudQuarterly2026Config.contentHeader.lightPolygon[3][1], flatCloudQuarterly2026Config.contentHeader.lightPolygon[2][1]]; assert.ok(new Set(lowerY).size >= 3); assert.doesNotMatch(generated, /height:\s*config\.contentHeader\.height|clipPath/); });
  check("admin and property previews share the same generated component", () => { assert.match(renderer, /<ReportDesignGeneratedBackground config=\{config\}\/?>/); assert.match(admin, /<ReportDesignGeneratedBackground config=\{config\} className="design-generated-background"\/?>/); });
  check("technical renderer still consumes technicalSections", () => assert.match(renderer, /model\.technicalSections\.flatMap/));
  check("technical statuses retain exact semantics", () => { for (const status of ["OK", "WATCH", "ACTION", "RISK"]) assert.match(renderer, new RegExp(`${status}:`)); });
  check("technical presentation has no dashboard card chrome", () => { assert.doesNotMatch(renderer, /qpr-technical-card/); assert.match(renderer, /qpr-technical-item/); assert.match(renderer, /qpr-technical-accent/); assert.match(css, /\.qpr-technical-item\{[^}]*border:0[^}]*background:transparent/); assert.match(css, /\.qpr-technical-accent\{[^}]*width:2\.4em/); });
  check("technical continuation behavior remains six items per page", () => { assert.match(renderer, /splitText\(section\.commentary, 550\)/); assert.match(renderer, /Math\.ceil\(expanded\.length \/ 6\)/); assert.match(renderer, /expanded\.slice\(index \* 6, index \* 6 \+ 6\)/); });
  check("footer exposes no raw role and keeps period copy", () => { const footer = renderer.match(/<footer className="qpr-footer"[\s\S]*?<\/footer>/)?.[0] || ""; assert.doesNotMatch(footer, /\{role\}|COVER|OVERVIEW|TECHNICAL|VALUATION|TRENDS/); assert.match(footer, /Q\{model\.report\.quarter\} \{model\.report\.year\}/); });
  check("footer uses readable presentation typography", () => { assert.match(css, /\.qpr-footer\{top:auto!important;bottom:2\.4%;height:2\.8%!important/); assert.match(css, /font:550 clamp\(7px,\.76vw,10px\)/); assert.match(css, /color:#50677f/); });
  check("cover implementation is unchanged", () => assert.equal(digest(segment(renderer, "function Cover", "function Overview")), "b88a7c413ebd532c481f57d4969a28774140451d95cf5a323a07c5337acbe42b"));
  check("overview implementation is unchanged", () => assert.equal(digest(segment(renderer, "function Overview", "function Technical")), "feeefc44496e26092c954daf1a7fd88a60069ec46a330740f120e8afa0d6d49d"));
  check("valuation implementation is unchanged", () => assert.equal(digest(segment(renderer, "function Valuation", "function MiniChart")), "80d070f2f44d0844a9eb5d69971d99eb3ae14dfba5afa932e8421b4f22e6fdd3"));
  check("trend renderer and selection data are unchanged", () => { assert.equal(digest(segment(renderer, "function Trends", "export function QuarterlyPropertyReportDocument")), "c2c5ba45e04b337b5119419ee54533521d233a3b883a8e79de06f08f7e379df2"); assert.equal(hash("lib/reporting/presentation/quarterly-property-presentation-data.ts"), "b1fbec8cfbf4cff5c5e44d698a23773a5dfccfb4ff8557d04cb7a8f435d6a6a6"); });
  check("canonical PDF remains protected", () => { assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf.tsx"), "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff"); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"), "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b"); });
  check("storage and Prisma remain protected", () => { assert.equal(hash("lib/storage/google-drive.ts"), "50d0988f0b1215fc3d0ffe13d0ed5cebbc666e31d999799cce58cc8fceb5eb4b"); assert.equal(hash("lib/storage/locations.ts"), "676e036c2fb1202650525e0e43424ae4840d16d476c0c436317d5346f8b2d9f8"); assert.equal(hash("prisma/schema.prisma"), "3dc503357f5ec3b46698b762a98d4a834f0e578dbff59f47186aa8818c0d7390"); });
  check("3B.2 follows 3B.1 in CI", () => assert.ok(ci.includes("      - run: npm run verify:report-design-3b1\n      - run: npm run verify:report-design-3b2\n      - run: npm run build")));
  console.log(`REPORT-DESIGN-3B.2 verification passed: ${count} checks.`);
}
main();
