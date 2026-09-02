import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> };
const workflow = read(".github/workflows/ci.yml");
const config = read("playwright.config.ts");
const smoke = read("e2e/flatcloud.smoke.spec.ts");
const loginPage = read("app/login/page.tsx");
const agentRules = read("AGENTS.md");
const runbook = read("docs/autonomous-qa.md");

assert(packageJson.devDependencies?.["@playwright/test"], "Chybí @playwright/test.");
assert.equal(packageJson.scripts?.["test:e2e"], "playwright test", "Chybí stabilní test:e2e příkaz.");
assert.equal(packageJson.scripts?.["e2e:seed"], "npm run db:bootstrap && npm run db:seed:demo", "E2E seed musí používat bootstrap a demo seed.");
assert.equal(packageJson.scripts?.["e2e:prepare"], "node scripts/prepare-e2e-standalone.mjs", "E2E musí připravit standalone assety.");
assert(workflow.includes("browser-smoke:"), "CI nemá samostatný browser-smoke job.");
assert(workflow.includes("needs: build"), "Browser smoke musí čekat na code/build gate.");
assert(workflow.includes("POSTGRES_DB: flatcloud_e2e"), "Browser smoke nemá izolovanou databázi.");
assert(workflow.includes("playwright install --with-deps chromium"), "CI neinstaluje Chromium.");
assert(workflow.includes("Upload browser evidence"), "CI neukládá diagnostické artefakty.");
assert(config.includes('trace: "retain-on-failure"'), "Chybí trace při selhání.");
assert(config.includes('screenshot: "only-on-failure"'), "Chybí screenshot při selhání.");
assert(config.includes('video: "retain-on-failure"'), "Chybí video při selhání.");
assert(config.includes(".next/standalone/server.js"), "Playwright musí spouštět Next.js standalone server.");
assert(config.includes("APP_URL: localBaseUrl"), "E2E redirecty a session cookie musí používat stejný origin.");
assert((smoke.match(/\btest\(/g) || []).length >= 8, "V23-A vyžaduje alespoň osm browser smoke scénářů.");
assert(smoke.includes("pageerror") && smoke.includes('message.type() === "error"') && smoke.includes("response.status() >= 500"), "Smoke testy musí hlídat pageerror, console.error a HTTP 5xx.");
assert(loginPage.includes('htmlFor="login-email"') && loginPage.includes('id="login-email"') && loginPage.includes('htmlFor="login-password"') && loginPage.includes('id="login-password"'), "Přihlašovací pole musí mít programově přístupné labely.");
assert(/nikdy.*main/i.test(agentRules) && /výslovn/i.test(agentRules), "AGENTS.md musí vyžadovat výslovné schválení před main.");
assert(/READY|BLOCKED/.test(runbook), "Runbook musí definovat výsledný stav READY/BLOCKED.");

console.log("V23-A autonomous QA foundation ověřena.");
