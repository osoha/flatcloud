import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css = readFileSync("app/flatberry.css", "utf8");
const subnav = readFileSync("components/PropertySubnav.tsx", "utf8");
const brand = readFileSync("components/SidebarCollapseToggle.tsx", "utf8");
let checks = 0;
function check(name: string, run: () => void) { run(); console.log(`✓ ${++checks}. ${name}`); }
// R31 supersedes R28's bevels and forced desktop fit with the user's original A.
check("approved skin is the final application stylesheet", () => assert.match(readFileSync("app/layout.tsx", "utf8"), /import "\.\/flatberry.css"/));
check("original A has a light attached strip and solid active tab", () => {
  assert.match(css, /border-top:3px solid #79a8fb/);
  assert.match(css, /background:#2468ef;color:#fff;border-radius:8px 8px 11px 11px/);
  assert.match(css, /property-header[^\n]+:has\([^\n]+margin-bottom:0;border-bottom:0/);
});
check("one stable scrollable row preserves natural label widths", () => {
  assert.match(css, /flex-wrap:nowrap[^\n]+overflow-x:auto/);
  assert.match(css, /flex:0 0 auto;min-width:max-content/);
  assert.doesNotMatch(css, /skewX|clip-path:polygon/);
});
check("property tabs retain operational routes; reporting moves to central reports", () => {
  for (const slug of ["prehled", "jednotky", "najemnici", "smlouvy", "platby", "finance", "vyuctovani/podklady", "provoz", "banka", "meridla", "technicke-udaje", "dokumenty", "nastaveni"]) assert.ok(subnav.includes(`"${slug}"`));
  assert.doesNotMatch(subnav, /\["reporting", "Reporty"\]/);
  assert.match(readFileSync("app/nemovitosti/[id]/reporting/page.tsx","utf8"), /redirect\(`/);
  assert.match(subnav, /unitLimited\?unitSections:fullSections/);
});
check("brand uses the same bitmap and a smaller clipping window", () => {
  assert.match(brand, /const bitmap = <span className="flatberry-brand-bitmap"/);
  assert.equal((brand.match(/\{bitmap\}/g) || []).length, 2);
  assert.match(css, /flatberry-mark-only\{width:26px\}/);
  assert.match(brand, /aria-label="Rozbalit levé menu"[^\n]+hidden=\{!collapsed\}/);
  assert.match(brand, /aria-label="Sbalit levé menu"[^\n]+hidden=\{collapsed\}/);
  assert.doesNotMatch(brand, /PanelLeftOpen/);
});
check("final icon corrections are explicit and isolated", () => {
  assert.match(css, /flatberry-heading-icon[^\n]+width:1.25cap;height:1.25cap/);
  assert.match(css, /entity-avatar>\.entity-avatar-glyph\{width:68%;height:68%/);
  assert.match(readFileSync("components/EntityAvatar.tsx", "utf8"), /onError=\{\(\) => setFailedId\(photoId\)\}/);
});
console.log(`Flatberry original A verified: ${checks} checks.`);
