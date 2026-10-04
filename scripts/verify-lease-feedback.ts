import assert from "node:assert/strict";
import { leaseServiceItemsFromForm } from "../lib/lease-service-items";
import { rentRollAmountsAt } from "../lib/reporting/rent-roll";
import { tenantIdentityFromForm } from "../lib/tenant-form";

const form = new FormData();
form.set("services", "2500,50");
assert.equal(leaseServiceItemsFromForm(form)[0].amountCents, 250050);
form.set("servicesMode", "ITEMIZED");
for (const [id, name, category, amount] of [["0", "Studená voda", "WATER", "700.25"], ["1", "Teplo", "HEATING", "1800.25"]]) {
  form.set(`serviceName:${id}`, name); form.set(`serviceCategory:${id}`, category); form.set(`serviceAmount:${id}`, amount);
}
const items = leaseServiceItemsFromForm(form);
assert.equal(items.reduce((sum, item) => sum + item.amountCents, 0), 250050, "aggregate must not be added to itemization");
const paymentItems = items.map(item => ({ ...item, active: true, validFrom: new Date("2026-01-01") }));
const lease = { rentCents: 1000000, servicesCents: 0, paymentItems };
assert.equal(rentRollAmountsAt(lease, new Date("2026-10-04")).services.amountCents, 250050, "live reporting includes all service categories");
assert.equal(rentRollAmountsAt({ ...lease, charges: [{ active: true, period: "2026-10", items }] }, new Date("2026-10-04")).services.amountCents, 250050);
form.set("serviceAmount:0", "-1"); assert.throws(() => leaseServiceItemsFromForm(form));
form.set("serviceAmount:0", "1e3"); assert.throws(() => leaseServiceItemsFromForm(form));
form.set("dateOfBirth", "1986-05-23"); form.set("identityDocumentNumber", "QA-ID-ONLY"); form.set("passportNumber", "QA-PASSPORT-ONLY");
assert.equal(tenantIdentityFromForm(form, "PERSON").dateOfBirth?.toISOString().slice(0, 10), "1986-05-23");
assert.deepEqual(tenantIdentityFromForm(form, "COMPANY"), { dateOfBirth: null, identityDocumentNumber: null, passportNumber: null });
form.set("dateOfBirth", "1986-02-31"); assert.throws(() => tenantIdentityFromForm(form, "PERSON"));
form.set("dateOfBirth", "2099-01-01"); assert.throws(() => tenantIdentityFromForm(form, "PERSON"));
console.log("Lease feedback: service totals, reporting and personal identity passed.");
