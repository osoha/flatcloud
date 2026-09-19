import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`✓ ${checks}. ${name}`); }

check("operational navigation remains permanently visible", () => {
  const shell = read("components/Shell.tsx");
  for (const marker of ['label="Portfolio"', 'label="Úkoly"', 'label="Nespárované platby"', 'label="Předpisy"']) assert.match(shell, new RegExp(marker));
  assert.ok(shell.indexOf('label="Portfolio"') < shell.indexOf("<CollapsibleNavGroup"));
});

check("secondary navigation is split into intentional collapsible groups", () => {
  const shell = read("components/Shell.tsx");
  assert.match(shell, /id="evidence" label="Evidence"[^\n]+defaultOpen/);
  assert.match(shell, /id="support" label="Podpora práce" activeRoots=\{\["\/metodika"\]\}/);
  assert.match(shell, /id="administration" label="Správa" activeRoots=\{\["\/uzivatele", "\/nastaveni"\]\}/);
  assert.match(shell, /superAdmin && <CollapsibleNavGroup id="administration"/);
});

check("group control is keyboard-accessible and exposes state", () => {
  const component = read("components/CollapsibleNavGroup.tsx");
  for (const marker of ['type="button"', "aria-expanded={expanded}", "aria-controls={panelId}", "hidden={!expanded}"]) assert.match(component, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
  assert.match(component, /<ChevronDown aria-hidden="true"/);
});

check("active route cannot remain hidden and user preference persists", () => {
  const component = read("components/CollapsibleNavGroup.tsx");
  assert.match(component, /const expanded = routeActive \|\| userOpen/);
  assert.match(component, /if \(routeActive\) return/);
  assert.match(component, /window\.localStorage\.getItem/);
  assert.match(component, /window\.localStorage\.setItem/);
});

check("styles retain visible focus and hide only collapsed item panels", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.nav-group-toggle:focus-visible\{outline:2px solid/);
  assert.match(css, /\.nav-group-toggle\[aria-expanded="true"\] svg\{transform:rotate\(180deg\)\}/);
  assert.match(css, /\.nav-group-items\[hidden\]\{display:none\}/);
});

check("browser regression covers collapsed, persisted and active-route states", () => {
  const smoke = read("e2e/flatcloud.smoke.spec.ts");
  assert.match(smoke, /R19B: sbalovací navigace/);
  assert.match(smoke, /toHaveAttribute\("aria-expanded", "false"\)/);
  assert.match(smoke, /keyboard\.press\("Enter"\)/);
  assert.match(smoke, /page\.goto\("\/metodika"\)/);
});

check("R19B verifier is part of the release gate", () => {
  assert.match(read("package.json"), /verify:r19b-collapsible-navigation/);
  assert.match(read(".github/workflows/ci.yml"), /verify:r19b-collapsible-navigation/);
});

console.log(`R19B sbalovací navigace ověřena: ${checks} kontrol.`);
