import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextLeaseAnniversary } from "../lib/lease-alerts";

const read = (path: string) => readFileSync(path, "utf8");
const leaseFields = read("components/LeaseCoreFields.tsx");
const leaseParties = read("lib/lease-parties.ts");
const leaseRoute = read("app/api/properties/[id]/leases/[leaseId]/route.ts");
const leaseNewPage = read("app/nemovitosti/[id]/smlouvy/nova/page.tsx");
const tenantSection = read("app/nemovitosti/[id]/[section]/page.tsx");
const userRoute = read("app/api/users/[id]/route.ts");
const userPage = read("app/uzivatele/[id]/page.tsx");
const shell = read("components/Shell.tsx");
const scopeLink = read("components/ScopeAwareLink.tsx");
const css = read("app/audit-polish.css");
const distribution = read("app/distribuce/page.tsx");
const report = read("app/reporty/page.tsx");

const dayZero = nextLeaseAnniversary(new Date(2026, 8, 5), new Date(2026, 8, 5));
assert.deepEqual([dayZero.getFullYear(), dayZero.getMonth(), dayZero.getDate()], [2027, 8, 5]);
const existingAnniversary = nextLeaseAnniversary(new Date(2025, 8, 5), new Date(2026, 8, 5));
assert.deepEqual([existingAnniversary.getFullYear(), existingAnniversary.getMonth(), existingAnniversary.getDate()], [2026, 8, 5]);

assert.match(leaseParties, /primaryAsPayer/);
assert.match(leaseParties, /primaryAsContact/);
assert.match(leaseRoute, /primaryChanged \|\| existing\.parties\.some/);
assert.match(leaseFields, /Vyberte nájemníka/);
assert.match(leaseFields, /target="_blank"/);
assert.match(leaseNewPage, /propertyLinks:[\s\S]*leases:[\s\S]*leaseParties:/);
assert.match(tenantSection, /Profil bez smlouvy/);
assert.match(userRoute, /isolationLevel: "Serializable"/);
assert.match(userRoute, /Posledního aktivního hlavního administrátora/);
assert.match(userPage, /locksLastAdmin/);
assert.match(shell, /Přeskočit na hlavní obsah/);
assert.match(shell, /ScopeAwareLink/);
assert.match(scopeLink, /sessionStorage/);
assert.match(css, /\.global-search:focus-within/);
assert.match(css, /\.skip-link:focus/);
assert.match(css, /th\{color:#59677f\}/);
assert.doesNotMatch(distribution, /take:\s*5/);
assert.doesNotMatch(report, /Předpis kvartálu|Inkaso kvartálu/);

console.log("Deep UX repair integrity, safety, scope and accessibility checks passed.");
