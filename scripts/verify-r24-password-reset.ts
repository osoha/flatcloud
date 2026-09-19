import assert from "node:assert/strict";
import { passwordResetError, sessionVersionMatches } from "../lib/password-reset-policy";

const valid = { actorId: "admin", targetId: "member", targetActive: true, targetRole: "OWNER_VIEWER", password: "isolated-policy-example", confirmation: "isolated-policy-example", confirmed: true, reason: "R24_AGENT_QA_2026_09" };
assert.equal(passwordResetError(valid), null);
for (const change of [
  { targetId: "admin" }, { targetRole: "SUPER_ADMIN" }, { targetActive: false },
  { confirmed: false }, { reason: "    " }, { reason: "a".repeat(501) },
  { password: "short" }, { confirmation: "different" },
  { password: "ě".repeat(37), confirmation: "ě".repeat(37) },
]) assert.ok(passwordResetError({ ...valid, ...change }));
assert.equal(passwordResetError({ ...valid, password: "a".repeat(72), confirmation: "a".repeat(72) }), null);
assert.equal(sessionVersionMatches(undefined, 0), true);
assert.equal(sessionVersionMatches(undefined, 1), false);
assert.equal(sessionVersionMatches(0, 1), false);
assert.equal(sessionVersionMatches(1, 1), true);
for (const claim of [null, "1", -1, 1.5, {}, true]) assert.equal(sessionVersionMatches(claim, 1), false);
console.log("R24 password-reset policy and session-version regression checks PASS");
