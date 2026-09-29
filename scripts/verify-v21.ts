import assert from "node:assert/strict";
import { verificationCodeForAccount } from "../lib/bank-email-verification";
import { bankVerificationPaymentPayload } from "../lib/bank-verification-qr";
import { addMonthsKeepingDay, complianceState } from "../lib/operations";

const code = verificationCodeForAccount("link-demo-1");
assert.match(code, /^\d{8}$/);
assert.equal(code, verificationCodeForAccount("link-demo-1"));
assert.notEqual(code, verificationCodeForAccount("link-demo-2"));
assert.equal(bankVerificationPaymentPayload({ accountNumber: "19-2000145399", bankCode: "0800", currency: "CZK" }, "32244573"),
  "SPD*1.0*ACC:CZ6508000000192000145399*AM:1.00*CC:CZK*X-VS:32244573");
assert.equal(bankVerificationPaymentPayload({ iban: "CZ65 0800 0000 1920 0014 5399" }, "32244573"),
  "SPD*1.0*ACC:CZ6508000000192000145399*AM:1.00*CC:CZK*X-VS:32244573");
assert.equal(bankVerificationPaymentPayload({ accountNumber: "19-2000145399", bankCode: "0800", currency: "EUR" }, "32244573"), null);
assert.equal(bankVerificationPaymentPayload({ iban: "CZ66 0800 0000 1920 0014 5399" }, "32244573"), null);
assert.equal(bankVerificationPaymentPayload({ iban: "CZ65 0800 0000 1920 0014 5399", accountNumber: "5", bankCode: "0800" }, "32244573"), null);

const now = new Date("2026-08-25T10:00:00Z");
assert.equal(complianceState({ active: true, nextDueAt: new Date("2026-08-20T00:00:00Z") }, now).key, "overdue");
assert.equal(complianceState({ active: true, nextDueAt: new Date("2026-09-10T00:00:00Z") }, now).key, "soon");
assert.equal(complianceState({ active: true, nextDueAt: new Date("2026-10-10T00:00:00Z") }, now).key, "upcoming");
assert.equal(complianceState({ active: false, nextDueAt: new Date("2026-08-20T00:00:00Z") }, now).key, "inactive");

assert.equal(addMonthsKeepingDay(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0,10), "2026-02-28");
assert.equal(addMonthsKeepingDay(new Date("2026-08-25T00:00:00Z"), 12).toISOString().slice(0,10), "2027-08-25");
console.log("FlatCloud V21 operations verification OK");
