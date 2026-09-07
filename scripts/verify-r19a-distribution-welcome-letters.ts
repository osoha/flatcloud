import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultWelcomeLetterContent, renderWelcomeLetter, welcomeSectionFields } from "../lib/distribution/welcome-letters";

const read = (path: string) => readFileSync(path, "utf8"); let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

check("FlatCloud template covers the source letter as editable sections", () => {
  assert.deepEqual(welcomeSectionFields.map(([, label]) => label), ["Předání nemovitosti", "Nájemní smlouva a platební údaje", "Pojištění nemovitosti", "Správa nemovitosti", "Evidence a FlatCloud Rent", "Zdanění příjmu a odpisy", "Společenství vlastníků jednotek"]);
  const content = defaultWelcomeLetterContent({ recipientName: "Jan Novák", propertyName: "Moskevská", propertyAddress: "Moskevská 24, Ústí nad Labem", unitLabel: "Byt 12", sellerName: "FlatCloud Moskevská s.r.o.", sellerEmail: "info@example.test" });
  assert.match(content.subject, /Moskevská/); assert.match(content.introduction, /Byt 12/); assert.match(content.introduction, /Moskevská 24/); assert.match(content.contactText, /FlatCloud Moskevská/);
  assert.doesNotMatch(Object.values(content).join(" "), /Westside|Spravujeme\.cz|Finstar|Zvládneme\.cz/i);
});

check("email preview is branded, readable and escapes edited content", () => {
  const base = defaultWelcomeLetterContent({ recipientName: "Kupující", propertyName: "Dům", propertyAddress: "Adresa", unitLabel: "1", sellerName: "SPV" });
  const rendered = renderWelcomeLetter({ ...base, introduction: "Bezpečný text <script>alert(1)</script>" });
  assert.match(rendered.html, /FlatCloud/); assert.match(rendered.html, /Průvodce nového vlastníka/); assert.match(rendered.html, /&lt;script&gt;/); assert.doesNotMatch(rendered.html, /<script>/); assert.match(rendered.text, /Předání nemovitosti/);
});

check("schema snapshots sale scope, revisions, approval and send history", () => {
  const schema = read("prisma/schema.prisma");
  for (const marker of ["model DistributionWelcomeLetter", "opportunityId", "propertyId", "sellerOwnerId", "recipientNameSnapshot", "ownershipRegisteredAt", "readyById", "sentById", "providerMessageId", "@@unique([opportunityId, revision])", "model DistributionWelcomeLetterAttachment"]) assert.ok(schema.includes(marker), marker);
  assert.match(schema, /enum DistributionWelcomeLetterStatus[\s\S]*DRAFT[\s\S]*READY[\s\S]*SENDING[\s\S]*SENT[\s\S]*ARCHIVED/);
});

check("additive migration preserves existing data and restrictive references", () => {
  const migration = read("prisma/migrations/20260907230000_distribution_welcome_letters/migration.sql");
  for (const marker of ["DistributionWelcomeLetterStatus", "DistributionWelcomeLetterAttachment", "ON DELETE RESTRICT", "opportunityId", "ownershipRegisteredAt"]) assert.match(migration, new RegExp(marker));
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
});

check("service enforces WON sale, acquisition date, review state and send lock", () => {
  const service = read("lib/distribution/welcome-letters.ts"), route = read("app/api/distribution/welcome-letters/[letterId]/route.ts");
  for (const marker of ["stage: \"WON\"", "status: \"READY\"", "ownershipRegisteredAt > new Date()", "status: \"SENDING\"", "lock.count !== 1", "acceptedByProvider", "DISTRIBUTION_WELCOME_LETTER_SEND_FAILED", "20 * 1024 * 1024", "sendMail", "DISTRIBUTION_WELCOME_LETTER_READY", "DISTRIBUTION_WELCOME_LETTER_UPDATED"]) assert.ok(service.includes(marker), marker);
  assert.match(route, /confirmSend/); assert.match(route, /form\.get\("confirmSend"\) !== "yes"/);
});

check("UI edits content, selects property documents and exposes preview", () => {
  const list = read("app/distribuce/uvitaci-dopisy/page.tsx"), detail = read("app/distribuce/uvitaci-dopisy/[letterId]/page.tsx");
  for (const marker of ["Žádné automatické odesílání podle katastru", "Vytvořit z FlatCloud šablony", "Uzavřené prodeje k založení"]) assert.match(list, new RegExp(marker));
  for (const marker of ["Úvod a obchodní shrnutí", "Přílohy z dokumentů domu", "Náhled e-mailu", "Předat ke kontrole", "Odeslat uvítací e-mail"]) assert.match(detail, new RegExp(marker));
});

check("methodology, browser smoke, CI and pipeline cover post-sale care", () => {
  assert.match(read("lib/methodology.ts"), /uvitaci-dopis-vlastnikovi/); assert.match(read("e2e/flatcloud.smoke.spec.ts"), /uvítací dopis navazuje na uzavřený prodej/); assert.match(read(".github/workflows/ci.yml"), /verify:r19a-distribution-welcome-letters/); assert.match(read("UX-REMODEL-PIPELINE.md"), /R19A implementováno/);
});

console.log(`R19A verifier passed (${passed} checks).`);
