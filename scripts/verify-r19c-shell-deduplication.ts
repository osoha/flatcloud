import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`✓ ${checks}. ${name}`); }

check("desktop identity is represented by the complete sidebar profile", () => {
  const shell = read("components/Shell.tsx");
  assert.match(shell, /className="user-card-profile" href="\/ucet"/);
  assert.match(shell, /className="account-chip" href="\/ucet" aria-label="Můj účet"/);
  assert.match(read("app/globals.css"), /@media\(min-width:701px\)\{\.v21-topbar \.account-chip\{display:none\}\}/);
});

check("mobile account access remains named when the sidebar disappears", () => {
  const css = read("app/globals.css");
  assert.match(css, /@media\(max-width:700px\)\{\.v21-shell \.sidebar\{display:none\}/);
  assert.match(read("components/Shell.tsx"), /aria-label="Můj účet"/);
});

check("redundant portfolio scope badge is removed while the scope picker remains", () => {
  const portfolio = read("app/portfolio/page.tsx");
  assert.doesNotMatch(portfolio, /Provozní cockpit · napříč vlastníky/);
  assert.match(portfolio, /PortfolioScopePicker/);
  const picker = read("components/PortfolioScopePicker.tsx");
  assert.match(picker, /Rozsah správy/);
  assert.match(picker, /Vše ve správě/);
});

check("browser regression covers desktop and mobile identity states", () => {
  const smoke = read("e2e/flatcloud.smoke.spec.ts");
  assert.match(smoke, /R19C: účet se na desktopu neduplikuje/);
  assert.match(smoke, /setViewportSize\(\{ width: 650, height: 844 \}\)/);
  assert.match(smoke, /getByRole\("link", \{ name: "Můj účet"/);
});

check("R19C verifier is part of the release gate", () => {
  assert.match(read("package.json"), /verify:r19c-shell-deduplication/);
  assert.match(read(".github/workflows/ci.yml"), /verify:r19c-shell-deduplication/);
});

console.log(`R19C deduplikace shellu ověřena: ${checks} kontrol.`);
