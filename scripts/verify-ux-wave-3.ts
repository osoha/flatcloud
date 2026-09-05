import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leaseFinancialVersionFingerprint } from "../lib/lease-financial-change";

const date = (value: string) => new Date(`${value}T12:00:00Z`);
const base = {
  rentCents: 10_000,
  servicesCents: 2_000,
  nextIndexationAt: null,
  endDate: null,
  terminatedOn: null,
  cancelledAt: null,
  paymentItems: [
    { id: "current", active: true, category: "RENT", amountCents: 10_000, validFrom: date("2026-09-01"), validTo: date("2026-09-30") },
    { id: "future", active: true, category: "RENT", amountCents: 11_000, validFrom: date("2026-10-01"), validTo: null },
  ],
  charges: [
    { id: "charge", active: true, period: "2026-10", manualOverride: false, allocations: [], securityDepositOffsets: [], creditApplications: [] },
  ],
};

assert.equal(leaseFinancialVersionFingerprint(base), leaseFinancialVersionFingerprint({ ...base, paymentItems: [...base.paymentItems].reverse() }));
assert.notEqual(leaseFinancialVersionFingerprint(base), leaseFinancialVersionFingerprint({ ...base, paymentItems: base.paymentItems.map((item) => item.id === "future" ? { ...item, amountCents: item.amountCents + 1 } : item) }));
assert.notEqual(leaseFinancialVersionFingerprint(base), leaseFinancialVersionFingerprint({ ...base, charges: base.charges.map((charge) => ({ ...charge, manualOverride: true })) }));

const read = (path: string) => readFileSync(path, "utf8");
assert.match(read("app/smlouvy/[leaseId]/finance/upravit/page.tsx"), /name="expectedFingerprint"/);
assert.match(read("app/api/properties/[id]/leases/[leaseId]/financial-change/route.ts"), /expectedFingerprint/);
assert.match(read("app/api/properties/[id]/leases/[leaseId]/terminate/route.ts"), /nelze je tímto formulářem přepsat/);
assert.match(read("app/smlouvy/[leaseId]/ukoncit/page.tsx"), /lease\.terminatedOn \|\| lease\.cancelledAt/);
assert.match(read("components/ScopeAwareLink.tsx"), /"\/distribuce"/);
assert.match(read("components/ScopeAwareLink.tsx"), /"\/platby\/nova"/);
assert.match(read("app/smlouvy/nova/page.tsx"), /selectedPropertyIds/);
assert.match(read("app/platby/nova/page.tsx"), /loadEditablePaymentLeases\(user, selection\.mode === "ALL" \? undefined : scopedIds\)/);
assert.match(read("app/api/payments/manual/route.ts"), /idempotencyExternalId/);
assert.match(read("app/platby/nova/page.tsx"), /idempotencyFieldName="idempotencyKey"/);
assert.match(read("components/RecoverableMutationForm.tsx"), /window\.crypto\.randomUUID\(\)/);
assert.match(read("components/RecoverableMutationForm.tsx"), /control\.type === "hidden"/);
assert.match(read("components/RecoverableMutationForm.tsx"), /history\.replaceState/);
assert.match(read("components/RecoverableMutationForm.tsx"), /Formulář už byl odeslán/);
assert.match(read("app/audit-polish.css"), /\.error-flash\{color:#9f1d18\}/);

console.log("Wave 3 scope, concurrency, idempotency, draft and accessibility guards passed.");
