import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workflow = readFileSync(".github/workflows/agent-dry-run.yml", "utf8");
const template = readFileSync(".github/ISSUE_TEMPLATE/agent-ready.yml", "utf8");
const validator = readFileSync("scripts/validate-agent-issue.mjs", "utf8");
const docs = readFileSync("docs/autonomous-qa.md", "utf8");

assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /issue_number:/);
assert.match(workflow, /permissions:\s*\n\s+contents: read\s*\n\s+issues: read/);
assert.doesNotMatch(workflow, /\b(write|admin)\b/);
assert.doesNotMatch(workflow, /secrets\./);
assert.doesNotMatch(workflow, /codex-action|OPENAI_API_KEY/);
assert.doesNotMatch(workflow, /merge|push/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /validate-agent-issue\.mjs/);
assert.match(workflow, /upload-artifact@v4/);

for (const field of ["Cíl", "Povolený rozsah", "Acceptance criteria", "Riziková třída", "Zakázané operace", "Povinné ověření", "Lidská brána"]) {
  assert.ok(template.includes(field), `Issue template must include ${field}`);
}
assert.match(template, /required: true/);
assert.match(template, /žádný přímý push ani merge do main/);

for (const guard of ["issue is not open", "missing sections", "no checklist item", "risk class", "human approval gate"]) {
  assert.ok(validator.includes(guard), `Validator must fail closed on ${guard}`);
}
assert.match(validator, /READY_FOR_IMPLEMENTATION/);
assert.match(validator, /BLOCKED/);
assert.match(validator, /Repository write permission: \*\*none\*\*/);
assert.match(validator, /Automatic merge: \*\*disabled\*\*/);

assert.match(docs, /V23-B/);
assert.match(docs, /OPENAI_API_KEY/);
assert.match(docs, /release-ready/);

const fixtureDir = mkdtempSync(join(tmpdir(), "flatcloud-v23-b-"));
try {
  const validIssue = {
    number: 16,
    title: "Controlled dry run",
    state: "open",
    html_url: "https://github.com/osoha/flatcloud/issues/16",
    body: `## Cíl\nOvěřit vstup.\n## Rozsah\nPouze test.\n## Acceptance criteria\n- [ ] Audit vznikne.\n## Riziko\nLOW\n## Lidská brána\nMerge do main vyžaduje výslovné schválení.`,
  };
  const validPath = join(fixtureDir, "valid.json");
  const closedPath = join(fixtureDir, "closed.json");
  const incompletePath = join(fixtureDir, "incomplete.json");
  const auditPath = join(fixtureDir, "audit.md");
  writeFileSync(validPath, JSON.stringify(validIssue));
  writeFileSync(closedPath, JSON.stringify({ ...validIssue, state: "closed" }));
  writeFileSync(incompletePath, JSON.stringify({ ...validIssue, body: "## Cíl\nNeúplné" }));

  execFileSync("node", ["scripts/validate-agent-issue.mjs", "--issue-file", validPath, "--audit-file", auditPath]);
  assert.match(readFileSync(auditPath, "utf8"), /READY_FOR_IMPLEMENTATION/);

  for (const rejectedPath of [closedPath, incompletePath]) {
    const result = spawnSync("node", ["scripts/validate-agent-issue.mjs", "--issue-file", rejectedPath, "--audit-file", auditPath]);
    assert.notEqual(result.status, 0, `${rejectedPath} must fail closed`);
    assert.match(readFileSync(auditPath, "utf8"), /BLOCKED/);
  }
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

console.log("V23-B controlled autonomous dry-run safeguards verified.");
