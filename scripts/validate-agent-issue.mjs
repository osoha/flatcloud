import { readFile, writeFile } from "node:fs/promises";

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
const body = typeof issue.body === "string" ? issue.body : "";
const number = Number(issue.number);

const requiredSections = [
  "Cíl",
  "Rozsah",
  "Acceptance criteria",
  "Riziko",
  "Lidská brána",
];
const missingSections = requiredSections.filter(
  (section) => !new RegExp(`^#{1,3}\\s+.*${section}`, "imu").test(body),
);
const checklistItems = body.match(/^\s*-\s*\[[ xX]\]\s+.+$/gmu) ?? [];
const risk = body.match(/\b(LOW|MEDIUM|HIGH)\b/u)?.[1] ?? null;
const mentionsMain = /\bmain\b/iu.test(body);
const mentionsApproval = /(schválen|souhlas|approval)/iu.test(body);

const failures = [];
if (!Number.isInteger(number) || number <= 0) failures.push("invalid issue number");
if (issue.state !== "open") failures.push("issue is not open");
if (!issue.title?.trim()) failures.push("missing title");
if (missingSections.length) failures.push(`missing sections: ${missingSections.join(", ")}`);
if (checklistItems.length === 0) failures.push("acceptance criteria contain no checklist item");
if (!risk) failures.push("missing LOW/MEDIUM/HIGH risk class");
if (!mentionsMain || !mentionsApproval) failures.push("missing explicit human approval gate for main");

const status = failures.length === 0 ? "READY_FOR_IMPLEMENTATION" : "BLOCKED";
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
