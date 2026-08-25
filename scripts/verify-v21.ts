import assert from "node:assert/strict";
import { verificationCodeForLink } from "../lib/bank-email-verification";
import { addMonthsKeepingDay, complianceState } from "../lib/operations";

const code = verificationCodeForLink("link-demo-1");
assert.match(code, /^\d{8}$/);
assert.equal(code, verificationCodeForLink("link-demo-1"));
assert.notEqual(code, verificationCodeForLink("link-demo-2"));

const now = new Date("2026-08-25T10:00:00Z");
assert.equal(complianceState({ active: true, nextDueAt: new Date("2026-08-20T00:00:00Z") }, now).key, "overdue");
assert.equal(complianceState({ active: true, nextDueAt: new Date("2026-09-10T00:00:00Z") }, now).key, "soon");
assert.equal(complianceState({ active: true, nextDueAt: new Date("2026-10-10T00:00:00Z") }, now).key, "upcoming");
assert.equal(complianceState({ active: false, nextDueAt: new Date("2026-08-20T00:00:00Z") }, now).key, "inactive");

assert.equal(addMonthsKeepingDay(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0,10), "2026-02-28");
assert.equal(addMonthsKeepingDay(new Date("2026-08-25T00:00:00Z"), 12).toISOString().slice(0,10), "2027-08-25");
console.log("FlatCloud V21 operations verification OK");
