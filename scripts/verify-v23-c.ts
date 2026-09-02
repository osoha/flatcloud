import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectAgentWork } from "./agent-intake-core.mjs";

const workflow = readFileSync(".github/workflows/agent-queue-dry-run.yml", "utf8");
const selector = readFileSync("scripts/select-agent-work.mjs", "utf8");
const docs = readFileSync("docs/autonomous-qa.md", "utf8");

assert.match(workflow, /schedule:\s*\n\s*- cron: ['"]17 \* \* \* \*['"]/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /permissions:\s*\n\s+contents: read\s*\n\s+issues: read\s*\n\s+pull-requests: read/);
assert.doesNotMatch(workflow, /\b(write|admin)\b/);
assert.doesNotMatch(workflow, /secrets\.|OPENAI_API_KEY|codex-action|merge|push/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /cancel-in-progress: false/);
assert.match(workflow, /select-agent-work\.mjs/);
assert.match(workflow, /upload-artifact@v4/);
assert.match(selector, /Maximum selected work items: \*\*1\*\*/);
assert.match(selector, /Repository write permission: \*\*none\*\*/);
assert.match(selector, /Automatic merge: \*\*disabled\*\*/);
assert.match(selector, /Repair loop limit: \*\*2\*\*/);
assert.match(docs, /nejvýše \*\*2 opravné cykly\*\*/);
assert.match(docs, /nikdy sám nemerguje do `main`/);

const valid = (number: number, risk = "LOW") => ({
  number,
  title: `[AGENT] Úkol ${number}`,
  state: "open",
  body: `## Cíl\nTest.\n## Rozsah\nRepo.\n## Acceptance criteria\n- [ ] Hotovo.\n## Riziko\n${risk}\n## Lidská brána\nMerge do main vyžaduje výslovné schválení.`,
});

assert.equal(selectAgentWork([valid(2)], []).decision, "READY");
assert.equal(selectAgentWork([valid(2, "MEDIUM")], []).decision, "READY");
assert.equal(selectAgentWork([valid(2, "HIGH")], []).decision, "BLOCKED");
assert.equal(selectAgentWork([], []).decision, "IDLE");
assert.equal(selectAgentWork([{ ...valid(2), title: "Běžný úkol" }], []).decision, "IDLE");
assert.equal(selectAgentWork([valid(2)], [{ number: 7, state: "open", head: { ref: "agent/issue-1-test" } }]).decision, "IDLE");
const blockedOldest = selectAgentWork([{ ...valid(2), body: "## Cíl\nNeúplné" }, valid(3)], []);
assert.equal(blockedOldest.decision, "BLOCKED");
assert.equal(blockedOldest.issue?.number, 2);
assert.equal(selectAgentWork([valid(8), valid(3)], []).issue?.number, 3);

const fixtureDir = mkdtempSync(join(tmpdir(), "flatcloud-v23-c-"));
try {
  const issuesFile = join(fixtureDir, "issues.json");
  const pullsFile = join(fixtureDir, "pulls.json");
  const auditFile = join(fixtureDir, "audit.md");
  const decisionFile = join(fixtureDir, "decision.json");
  writeFileSync(issuesFile, JSON.stringify([valid(21)]));
  writeFileSync(pullsFile, "[]");
  execFileSync("node", ["scripts/select-agent-work.mjs", "--issues-file", issuesFile, "--pulls-file", pullsFile, "--audit-file", auditFile, "--decision-file", decisionFile]);
  assert.match(readFileSync(auditFile, "utf8"), /Decision: \*\*READY\*\*/);
  assert.equal(JSON.parse(readFileSync(decisionFile, "utf8")).issue.number, 21);
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

console.log("V23-C autonomous queue safeguards verified.");
