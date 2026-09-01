import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd(), read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = (file: string) => digest(read(file));
const segment = (source: string, start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end));
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

function main() {
  const renderer = read("components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx"), pagination = segment(renderer, "function paginateTechnicalSections", "function Page"), technical = segment(renderer, "function Technical", "function Valuation"), css = read("app/globals.css"), editorial = read("lib/reporting/editorial-schema.ts"), ci = read(".github/workflows/ci.yml");
  check("technical page is a strict three-column layout", () => assert.match(css, /\.qpr-technical-table\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/));
  check("a technical page contains at most nine logical areas", () => { assert.match(pagination, /current\.length === 9/); assert.doesNotMatch(pagination, /length \/ 6|slice\([^)]*\+ 6/); });
  check("every technical item has a blue title band", () => { assert.match(technical, /qpr-technical-title-band/); assert.match(css, /\.qpr-technical-title-band\{[^}]*background:var\(--qpr-primary\)[^}]*color:var\(--qpr-white\)/); });
  check("every title band is followed by a commentary cell", () => { assert.match(technical, /<h3 className="qpr-technical-title-band">[\s\S]*?<div className="qpr-technical-commentary">/); assert.match(css, /\.qpr-technical-commentary\{[^}]*align-items:center[^}]*text-align:center/); });
  check("technical cells form one contiguous ruled table", () => { assert.match(css, /\.qpr-technical-table\{[^}]*gap:0[^}]*border-top:1px solid var\(--qpr-primary\)[^}]*border-left:1px solid var\(--qpr-primary\)/); assert.match(css, /\.qpr-technical-cell\{[^}]*border-right:1px solid var\(--qpr-primary\)[^}]*border-bottom:1px solid var\(--qpr-primary\)/); });
  check("technical presentation has no rounded cards", () => { assert.doesNotMatch(technical, /qpr-technical-card|borderRadius/); assert.doesNotMatch(css.match(/\.qpr-technical-(?:table|cell|title-band|commentary)[^{]*\{[^}]*\}/g)?.join("") || "", /border-radius/); });
  check("technical presentation has no dashboard status pills", () => assert.doesNotMatch(technical, /status-|technicalLabels|<span>/));
  check("technical presentation has no colored status accents", () => assert.doesNotMatch(technical, /qpr-technical-accent|status-OK|status-WATCH|status-ACTION|status-RISK/));
  check("technicalSections data loading is unchanged", () => { assert.match(technical, /paginateTechnicalSections\(model\.technicalSections\)/); assert.equal(hash("lib/reporting/presentation/quarterly-property-presentation-data.ts"), "b1fbec8cfbf4cff5c5e44d698a23773a5dfccfb4ff8557d04cb7a8f435d6a6a6"); });
  check("OK WATCH ACTION RISK remain model semantics", () => { for (const status of ["OK", "WATCH", "ACTION", "RISK"]) assert.match(editorial, new RegExp(`"${status}"`)); assert.equal(hash("lib/reporting/editorial-schema.ts"), "ab6e54e8bee77cfc29a7db197a0dcfd379e6884d656202f97dfd255b7c6f2591"); });
  check("continuation is deterministic and long areas advance to a new page", () => { assert.match(pagination, /splitText\(section\.commentary, 320\)/); assert.match(pagination, /if \(index > 0\) flush\(\)/); assert.match(pagination, /if \(index < commentaryParts\.length - 1\) flush\(\)/); assert.match(pagination, /pokračování \$\{index \+ 1\}/); });
  check("cover and overview are unchanged", () => { assert.equal(digest(segment(renderer, "function Cover", "function Overview")), "b88a7c413ebd532c481f57d4969a28774140451d95cf5a323a07c5337acbe42b"); assert.equal(digest(segment(renderer, "function Overview", "function Technical")), "feeefc44496e26092c954daf1a7fd88a60069ec46a330740f120e8afa0d6d49d"); });
  check("generated header and logo renderer are unchanged", () => { assert.equal(hash("components/reporting/ReportDesignGeneratedBackground.tsx"), "806d2832e4b58b869681b648dcb7a8b497fa38a1323f520c0533bcd82e2ea4f0"); assert.equal(digest(segment(renderer, "function Page", "function Cover")), "d22e799f0bcd66475aa0aa2ff47e24cd4bd832d61b6dbe0f98879c92ddd88b40"); });
  check("valuation is unchanged", () => assert.equal(digest(segment(renderer, "function Valuation", "function MiniChart")), "80d070f2f44d0844a9eb5d69971d99eb3ae14dfba5afa932e8421b4f22e6fdd3"));
  check("footer is unchanged", () => assert.equal(digest(segment(renderer, "function Page", "function Cover")), "d22e799f0bcd66475aa0aa2ff47e24cd4bd832d61b6dbe0f98879c92ddd88b40"));
  check("trends renderer and selection are unchanged", () => { assert.equal(digest(segment(renderer, "function MiniChart", "function Trends")), "235068c5a2fa2cf172479226aed3ada2504db1c8731ee5142125882fb87da063"); assert.equal(digest(segment(renderer, "function Trends", "export function QuarterlyPropertyReportDocument")), "c2c5ba45e04b337b5119419ee54533521d233a3b883a8e79de06f08f7e379df2"); });
  check("canonical PDF remains protected", () => { assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf.tsx"), "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff"); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"), "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b"); });
  check("storage and Prisma remain protected", () => { assert.equal(hash("lib/storage/google-drive.ts"), "50d0988f0b1215fc3d0ffe13d0ed5cebbc666e31d999799cce58cc8fceb5eb4b"); assert.equal(hash("lib/storage/locations.ts"), "676e036c2fb1202650525e0e43424ae4840d16d476c0c436317d5346f8b2d9f8"); assert.equal(hash("prisma/schema.prisma"), "3dc503357f5ec3b46698b762a98d4a834f0e578dbff59f47186aa8818c0d7390"); assert.equal(fs.readdirSync(path.join(root, "prisma/migrations")).filter((name) => /3b3|technical.*pptx/i.test(name)).length, 0); });
  check("3B.3 runs after 3B.2 and before build", () => assert.ok(ci.includes("      - run: npm run verify:report-design-3b2\n      - run: npm run verify:report-design-3b3\n      - run: npm run build")));
  console.log(`REPORT-DESIGN-3B.3 verification passed: ${count} checks.`);
}
main();
