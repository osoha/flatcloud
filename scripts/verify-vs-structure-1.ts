import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { proposedLeaseIdentity, proposedVariableSymbol, validateVariableSymbol } from "../lib/variable-symbol";

const read = (path: string) => readFileSync(path, "utf8");
const first = proposedLeaseIdentity({ propertyCode: "1201" }, { unitCode: "005", leases: [] }, new Set());
assert.deepEqual(first, { sequence: 1, variableSymbol: "120100501", contractNumber: "NS-P1201-U005-01" });

const second = proposedLeaseIdentity({ propertyCode: "1201" }, { unitCode: "005", leases: [{ id: "ended" }] }, new Set(["legacy-vs"]));
assert.deepEqual(second, { sequence: 2, variableSymbol: "120100502", contractNumber: "NS-P1201-U005-02" });

assert.equal(proposedVariableSymbol({ propertyCode: "1201" }, { unitCode: "005", leases: [] }, new Set()), "120100501");
assert.deepEqual(
  proposedLeaseIdentity({ propertyCode: "1201" }, { unitCode: "005", leases: [] }, new Set(["120100501"])),
  { sequence: 2, variableSymbol: "120100502", contractNumber: "NS-P1201-U005-02" },
);

assert.deepEqual(
  proposedLeaseIdentity({ propertyCode: "1202" }, { unitCode: "005", leases: [] }, new Set()),
  { sequence: 1, variableSymbol: "120200501", contractNumber: "NS-P1202-U005-01" },
  "Duplicate human names cannot collide when stable property codes differ.",
);
assert.equal(proposedLeaseIdentity({ propertyCode: "1000" }, { unitCode: "005", leases: [] }, new Set()), null);
assert.equal(proposedLeaseIdentity({ propertyCode: "1201" }, { unitCode: "000", leases: [] }, new Set()), null);
assert.equal(proposedLeaseIdentity({ propertyCode: "1201" }, { unitCode: "005", leases: Array.from({ length: 99 }, (_, index) => ({ id: String(index) })) }, new Set()), null);
assert.equal(
  proposedLeaseIdentity({ propertyCode: "1201" }, { unitCode: "005", leases: Array.from({ length: 98 }, (_, index) => ({ id: String(index) })) }, new Set(["120100599"])),
  null,
);

assert.equal(validateVariableSymbol("120100501"), "120100501");
assert.equal(validateVariableSymbol("7"), "7", "Manual legacy VS remains supported.");
assert.throws(() => validateVariableSymbol("NS-P1201"));

const variableSource = read("lib/variable-symbol.ts");
const businessIdentity = read("lib/business-identity.ts");
const form = read("components/LeaseCoreFields.tsx");
const createLease = read("lib/lease-create.ts");
const bankParser = read("lib/inbound-bank/bank-email.ts");
const schema = read("prisma/schema.prisma");
const migrations = readdirSync("prisma/migrations").filter((name) => name > "20260902230000_identity_1");

assert.match(variableSource, /isPropertyCode\(property\.propertyCode\)/);
assert.match(variableSource, /isUnitCode\(unit\.unitCode\)/);
assert.doesNotMatch(variableSource, /address|technicalData|buildingNumber/);
assert.match(variableSource, /type UnitForLeaseIdentity = \{ unitCode: string; leases:/, "Lease identity input must not accept a mutable unit label.");
assert.match(variableSource, /NS-P\$\{property\.propertyCode\}-U\$\{unit\.unitCode\}-\$\{sequence\}/);
assert.match(businessIdentity, /Lease identities never parse labels/);

assert.match(form, /contractNumberProposals/);
assert.match(form, /setContractNumber/);
assert.match(form, /setVariableSymbol/);
assert.match(form, /name="contractNumber"/);
assert.match(form, /name="variableSymbol"/);
assert.match(form, /stabilního ID nemovitosti, jednotky a pořadí vztahu/);

assert.match(createLease, /contractNumber: text\(form, "contractNumber"\)/, "Custom contract numbers must remain stored as entered.");
assert.match(createLease, /validateVariableSymbol\(text\(form, "variableSymbol", true\)!\)/, "Custom numeric VS must remain validated and supported.");
assert.match(variableSource, /ownerBankAccountId/);
assert.match(variableSource, /historicky používá smlouva/);
assert.match(schema, /@@unique\(\[ownerBankAccountId, variableSymbol\]\)/);
assert.match(schema, /@@unique\(\[unitId, variableSymbol\]\)/);
assert.doesNotMatch(bankParser, /propertyCode|unitCode|proposedLeaseIdentity/, "Bank parser must match stored VS instead of decoding business identities.");
assert.ok(migrations.every((name) => !/vs|variable|contract/i.test(name)), "VS-STRUCTURE-1 must not add an identity data migration.");

for (const page of [
  "app/nemovitosti/[id]/najemnici/novy/page.tsx",
  "app/nemovitosti/[id]/smlouvy/nova/page.tsx",
]) {
  const source = read(page);
  assert.match(source, /proposedLeaseIdentity/);
  assert.match(source, /contractNumberProposals/);
}

const editLeasePage = read("app/nemovitosti/[id]/smlouvy/[leaseId]/upravit/page.tsx");
assert.match(editLeasePage, /proposedLeaseIdentity/);
assert.doesNotMatch(editLeasePage, /contractNumberProposals/, "Editing a historical lease must not fill a previously empty contract number.");

console.log("VS-STRUCTURE-1 stable VS and contract-number proposals verified.");
