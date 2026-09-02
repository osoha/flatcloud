import { cpSync, existsSync, mkdirSync } from "node:fs";

const standaloneRoot = ".next/standalone";
if (!existsSync(`${standaloneRoot}/server.js`)) {
  throw new Error("Chybí .next/standalone/server.js. Nejdříve spusťte npm run build.");
}

mkdirSync(`${standaloneRoot}/.next`, { recursive: true });
cpSync(".next/static", `${standaloneRoot}/.next/static`, { recursive: true, force: true });
if (existsSync("public")) cpSync("public", `${standaloneRoot}/public`, { recursive: true, force: true });

console.log("Standalone server pro Playwright je připraven.");
