import { readFile, writeFile } from "node:fs/promises";
import { selectAgentWork } from "./agent-intake-core.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const issuesFile = argument("--issues-file");
const pullsFile = argument("--pulls-file");
const auditFile = argument("--audit-file");
const decisionFile = argument("--decision-file");
if (!issuesFile || !pullsFile || !auditFile || !decisionFile) {
  throw new Error("Usage: node scripts/select-agent-work.mjs --issues-file <json> --pulls-file <json> --audit-file <md> --decision-file <json>");
}

const issues = JSON.parse(await readFile(issuesFile, "utf8"));
const pulls = JSON.parse(await readFile(pullsFile, "utf8"));
const result = selectAgentWork(issues, pulls);
const audit = `# FlatCloud autonomous queue audit\n\n` +
  `- Decision: **${result.decision}**\n` +
  `- Reason: ${result.reason}\n` +
  `- Selected issue: ${result.issue ? `#${result.issue.number} · ${result.issue.title}` : "none"}\n` +
  `- Risk: ${result.issue?.risk ?? "none"}\n` +
  `- Maximum selected work items: **1**\n` +
  `- Repository write permission: **none**\n` +
  `- Automatic merge: **disabled**\n` +
  `- Repair loop limit: **2**\n`;

await Promise.all([
  writeFile(auditFile, audit, "utf8"),
  writeFile(decisionFile, JSON.stringify(result, null, 2), "utf8"),
]);
console.log(audit);
