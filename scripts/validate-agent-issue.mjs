import { readFile, writeFile } from "node:fs/promises";
import { validateAgentIssue } from "./agent-intake-core.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const issueFile = argument("--issue-file");
const auditFile = argument("--audit-file");

if (!issueFile || !auditFile) {
  throw new Error("Usage: node scripts/validate-agent-issue.mjs --issue-file <json> --audit-file <md>");
}

const issue = JSON.parse(await readFile(issueFile, "utf8"));
const number = Number(issue.number);
const { status, failures, risk, checklistItems } = validateAgentIssue(issue);
const repository = process.env.GITHUB_REPOSITORY ?? "local/flatcloud";
const sha = process.env.GITHUB_SHA ?? "local-dry-run";
const ref = process.env.GITHUB_REF_NAME ?? "local";
const issueUrl = issue.html_url ?? `https://github.com/${repository}/issues/${number}`;

const audit = `# FlatCloud agent intake audit\n\n` +
  `- Status: **${status}**\n` +
  `- Issue: [#${number}](${issueUrl})\n` +
  `- Title: ${String(issue.title ?? "").replace(/[\r\n]+/g, " ")}\n` +
  `- Risk: ${risk ?? "UNKNOWN"}\n` +
  `- Checklist items: ${checklistItems.length}\n` +
  `- Repository: ${repository}\n` +
  `- Ref: ${ref}\n` +
  `- Commit: ${sha}\n` +
  `- Repository write permission: **none**\n` +
  `- Automatic merge: **disabled**\n\n` +
  `## Validation\n\n` +
  (failures.length === 0
    ? "All required intake controls passed.\n"
    : failures.map((failure) => `- ${failure}`).join("\n") + "\n");

await writeFile(auditFile, audit, "utf8");
console.log(audit);

if (failures.length > 0) process.exitCode = 1;
