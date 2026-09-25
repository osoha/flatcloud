import assert from "node:assert/strict";
import { withGroupMentions, mentionRecipientIds, taskComposerMode, type DiscussionPerson } from "../lib/task-discussion-shared";
const people: DiscussionPerson[] = [
  { id: "member", name: "Jana", email: "jana@example.test", internal: true, participant: true },
  { id: "fc", name: "Petr", email: "petr@example.test", internal: true, participant: false, flatcloudMember: true },
  { id: "both", name: "Eva", email: "eva@example.test", internal: true, participant: true, flatcloudMember: true },
];
assert.deepEqual(mentionRecipientIds(withGroupMentions("@all @board @flatcloud @all", []), people).sort(), ["both", "fc", "member"]);
assert.deepEqual(mentionRecipientIds(withGroupMentions("@all", []), people).sort(), ["both", "member"]);
assert.deepEqual(mentionRecipientIds(withGroupMentions("@flatcloud", []), people).sort(), ["both", "fc"]);
assert.equal(withGroupMentions("email@all.cz /@board @alligator @flatcloudX", []).length, 0);
assert.equal(withGroupMentions("(@ALL), prosím @board!", []).length, 2);
assert.equal(withGroupMentions("@Jana @all", [{ userId: "member", label: "Jana", start: 0, end: 5 }]).length, 2);
assert.equal(withGroupMentions("@all Novák", [{ userId: "person", label: "all Novák", start: 0, end: 10 }]).length, 1);
assert.equal(withGroupMentions("@all", [{ userId: "group:flatcloud", label: "all", start: 0, end: 4 }])[0].userId, "group:all");
assert.throws(() => withGroupMentions("@all ".repeat(51), []));
for (const category of ["GENERAL", "COMPLIANCE", "MAINTENANCE"]) assert.deepEqual(taskComposerMode({ category, propertyId: "p", unitId: "u", status: "OPEN" }), { showKinds: false, allowPromise: false });
assert.deepEqual(taskComposerMode({ category: "COLLECTION" }), { showKinds: false, allowPromise: false });
assert.deepEqual(taskComposerMode({ category: "LEASE", propertyId: "p", leaseId: "l" }), { showKinds: true, allowPromise: false });
assert.deepEqual(taskComposerMode({ category: "COLLECTION", propertyId: "p", unitId: "u", status: "OPEN" }), { showKinds: true, allowPromise: true });
assert.equal(taskComposerMode({ category: "COLLECTION", propertyId: "p", unitId: "u", status: "DONE" }).allowPromise, false);
assert.equal(taskComposerMode({ category: "COLLECTION", propertyId: "p", unitId: "u", conditionPlanExecution: {} }).allowPromise, false);
assert.equal(taskComposerMode({ category: "LEASE", propertyId: "p", leaseId: "l", automationRuleId: "rule" }).showKinds, false);
console.log("Task polish: group parsing, deduplication and contextual composer rules passed.");
