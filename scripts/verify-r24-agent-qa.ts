import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { R24_FINDING_FIELDS, R24_LIFECYCLES, R24_PERSONAS } from "../lib/r24-agent-qa";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) { run(); checks += 1; console.log(`✓ ${checks}. ${name}`); }

check("persona matrix covers operational, expert, financial, security and accessibility lenses", () => {
  assert.ok(R24_PERSONAS.length >= 14);
  for (const id of ["novice", "external-owner", "distribution-lead", "technical-manager", "unit-manager", "asset-manager", "graphic-designer", "product-developer", "legal-controller", "financial-controller", "security-admin", "accessibility-reviewer"]) {
    assert.ok(R24_PERSONAS.some((persona) => persona.id === id), id);
  }
});

check("P0 matrix covers cross-module handoffs and negative integrity scenarios", () => {
  assert.ok(R24_LIFECYCLES.filter((item) => item.risk === "P0").length >= 6);
  for (const id of ["scope", "distribution", "tenancy", "maintenance", "reporting", "integrity"]) assert.ok(R24_LIFECYCLES.some((item) => item.id === id));
});

check("finding contract requires reproducible evidence and an acceptance test", () => {
  for (const field of ["persona", "url", "steps", "expected", "actual", "evidence", "scope", "reproducibility", "acceptanceTest"]) assert.ok(R24_FINDING_FIELDS.includes(field as never), field);
});

check("role seed is isolated, idempotent and uses only visibly marked test identities", () => {
  const source = read("prisma/seed-r24-agent-roles.ts");
  for (const marker of ["@flatcloud.test", "R24_DATA_MARKER", "user.upsert", "userProperty.upsert", "userUnit.upsert", "E2E_ROLE_PASSWORD"]) assert.match(source, new RegExp(marker.replace(".", "\\.")));
  assert.doesNotMatch(read("prisma/seed.ts"), /ensureR24AgentRoles|R24_ROLE_PASSWORD/);
});

check("browser suite exercises real pages for each application persona and direct URL isolation", () => {
  const spec = read("e2e/zz-r24-agent-roles.spec.ts");
  for (const marker of ["R24_ROLE_USERS.novice", "R24_ROLE_USERS.externalOwner", "R24_ROLE_USERS.internalAssistant", "R24_ROLE_USERS.technicalManager", "R24_ROLE_USERS.unitManager", "R24_ROLE_USERS.distributionLead", "R24_ROLE_USERS.assetManager", "forbidden?.status()", "R24_AGENT_QA_2026_09"]) assert.match(spec, new RegExp(marker.replace(/[?.()]/g, "\\$&")));
});

check("visual gate checks heading, active navigation and viewport overflow", () => {
  const spec = read("e2e/zz-r24-agent-roles.spec.ts");
  for (const marker of ["main h1", "aria-current", "scrollWidth", "clientWidth"]) assert.match(spec, new RegExp(marker));
});

check("CI seeds roles only in isolated browser job and runs the R24 verifier", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /browser-smoke:[\s\S]*E2E_ROLE_PASSWORD:[\s\S]*npm run e2e:seed:r24-roles/);
  assert.match(ci, /npm run verify:r24-agent-qa/);
});

check("audit plan keeps external communication, legal effect, production and deletion outside the run", () => {
  const plan = read("docs/r24-agent-test-plan.md");
  for (const marker of ["Nic se v sandboxu nemaže", "Automatická komunikace", "právní účinnost", "produkční změna", "fake/local stav se v UI nesmí vydávat"]) assert.match(plan, new RegExp(marker, "i"));
});

check("legal pipeline distinguishes rent, sublease, signature and delivery", () => {
  const plan = read("docs/r24-agent-test-plan.md");
  for (const marker of ["nájem, podnájem", "podpis od důkazu doručení", "podepsaný dokument se neregeneruje", "Zvládneme.cz je pouze inspirační katalog"]) assert.match(plan, new RegExp(marker, "i"));
});

check("audit records live-browser authentication as an explicit incomplete gate", () => {
  const audit = read("docs/audits/r24-agent-audit-2026-09-08.md");
  assert.match(audit, /Stav: `IN_PROGRESS`/);
  assert.match(audit, /čeká na obnovení zabezpečené relace/);
  assert.doesNotMatch(audit, /Stav: `READY`/);
});

console.log(`R24 agentní QA ověřena: ${checks} kontrol.`);
