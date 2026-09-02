export function validateAgentIssue(issue) {
  const body = typeof issue?.body === "string" ? issue.body : "";
  const number = Number(issue?.number);
  const requiredSections = ["Cíl", "Rozsah", "Acceptance criteria", "Riziko", "Lidská brána"];
  const missingSections = requiredSections.filter(
    (section) => !new RegExp(`^#{1,3}\\s+.*${section}`, "imu").test(body),
  );
  const checklistItems = body.match(/^\s*-\s*\[[ xX]\]\s+.+$/gmu) ?? [];
  const risk = body.match(/\b(LOW|MEDIUM|HIGH)\b/u)?.[1] ?? null;
  const failures = [];

  if (!Number.isInteger(number) || number <= 0) failures.push("invalid issue number");
  if (issue?.state !== "open") failures.push("issue is not open");
  if (!issue?.title?.trim()) failures.push("missing title");
  if (missingSections.length) failures.push(`missing sections: ${missingSections.join(", ")}`);
  if (checklistItems.length === 0) failures.push("acceptance criteria contain no checklist item");
  if (!risk) failures.push("missing LOW/MEDIUM/HIGH risk class");
  if (!/\bmain\b/iu.test(body) || !/(schválen|souhlas|approval)/iu.test(body)) {
    failures.push("missing explicit human approval gate for main");
  }

  return {
    status: failures.length === 0 ? "READY_FOR_IMPLEMENTATION" : "BLOCKED",
    failures,
    risk,
    checklistItems,
  };
}

export function selectAgentWork(issues, pulls) {
  const activeAgentPull = (Array.isArray(pulls) ? pulls : []).find(
    (pull) => pull?.state === "open" && /^agent\/issue-\d+-/u.test(pull?.head?.ref || ""),
  );
  if (activeAgentPull) {
    return { decision: "IDLE", reason: `agent pull request #${activeAgentPull.number} is still open`, issue: null };
  }

  const queue = (Array.isArray(issues) ? issues : [])
    .filter((issue) => issue?.state === "open" && !issue?.pull_request && /^\[AGENT\]\s+/u.test(issue?.title || ""))
    .sort((a, b) => Number(a.number) - Number(b.number));
  if (!queue.length) return { decision: "IDLE", reason: "no open [AGENT] issue", issue: null };

  const issue = queue[0];
  const intake = validateAgentIssue(issue);
  if (intake.status !== "READY_FOR_IMPLEMENTATION") {
    return { decision: "BLOCKED", reason: intake.failures.join("; "), issue: { number: issue.number, title: issue.title, risk: intake.risk } };
  }
  if (intake.risk === "HIGH") {
    return { decision: "BLOCKED", reason: "HIGH risk requires human planning and explicit launch", issue: { number: issue.number, title: issue.title, risk: intake.risk } };
  }

  return {
    decision: "READY",
    reason: "oldest valid LOW/MEDIUM issue selected",
    issue: { number: issue.number, title: issue.title, risk: intake.risk },
  };
}
