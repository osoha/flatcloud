import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`✓ ${checks}. ${name}`); }

check("sidebar separates shareholder reporting from distribution", () => {
  const shell = read("components/Shell.tsx");
  assert.match(shell, /href="\/reporty\/akcionarske"[^\n]+label="Akcionářské reporty"/);
  assert.match(shell, /href="\/distribuce"[^\n]+label="Distribuce"/);
  assert.doesNotMatch(shell, /label="Kategorizace"/);
});
check("shareholder hub exposes quarterly workflow without a dead annual link", () => {
  const page = read("app/reporty/akcionarske/page.tsx");
  assert.match(page, /href="\/reporty\/kvartalni"/);
  assert.match(page, /Výroční reporty/);
  assert.match(page, /aria-disabled="true"/);
  assert.match(page, /hasReportingBackofficeAccess/);
});
check("administration has a focused overview and preserves the settings workspace", () => {
  const overview = read("app/nastaveni/page.tsx");
  const system = read("app/nastaveni/system/page.tsx");
  for (const marker of ["Integrace a automatizace", "Reporting", "Uživatelé a přístupy", "Data a importy", "Audit a údržba"]) assert.match(overview, new RegExp(marker));
  for (const marker of ["Cenová mapa nájemného MF", "Google Drive", "Sběrný e-mail bankovních notifikací", "SMTP a automatická komunikace"]) assert.match(system, new RegExp(marker));
});
check("settings mutations return to their editing context", () => {
  for (const path of ["app/api/settings/inbound-mail/route.ts", "app/api/settings/notifications/route.ts", "app/api/settings/storage/test/route.ts", "app/api/settings/mf-rent/sync/route.ts"]) assert.match(read(path), /\/nastaveni\/system/);
});
check("distribution copy is explicitly internal without the ambiguous category label", () => {
  const page = read("app/distribuce/page.tsx");
  assert.match(page, /Interní distribuce/);
  assert.match(page, /Interní obchodní modul/);
  assert.doesNotMatch(page, /Kategorizace a distribuce/);
});
console.log(`R7 navigace a administrace ověřeny: ${checks} kontrol.`);
