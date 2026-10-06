import assert from "node:assert/strict";
import { contractLandlord } from "../lib/lease-contracts/landlord";
import {
  actionKind,
  actionMeanings,
  hashContent,
  nonRenewalText,
  packetStatus,
} from "../lib/lease-actions/core";

const owner = (id: string) => ({
  id,
  name: id,
  type: "PERSON",
  ico: null,
  address: null,
  email: null,
  phone: null,
});
const a = owner("unit"),
  b = owner("building"),
  historic = owner("historic");
const lease = {
  startDate: new Date("2026-11-01T12:00Z"),
  ownerBankAccountId: null as string | null,
  landlordPeriods: [] as Array<{
    fromPeriod: string;
    toPeriod: string | null;
    owner: typeof a;
  }>,
  unit: {
    ownerships: [{ owner: a, ownerBankAccountId: "account" }],
    property: {
      owner: b,
      ownershipMode: "UNIT_BASED",
      ownerships: [] as Array<{ owner: typeof a }>,
    },
  },
};
assert.equal(contractLandlord(lease).owner?.id, a.id);
assert.equal(
  contractLandlord({
    ...lease,
    landlordPeriods: [
      { fromPeriod: "2020-01", toPeriod: "2026-11", owner: historic },
    ],
  }).owner?.id,
  historic.id,
);
assert.equal(
  contractLandlord({
    ...lease,
    landlordPeriods: [
      { fromPeriod: "2026-12", toPeriod: null, owner: historic },
    ],
  }).owner?.id,
  a.id,
);
const joint = {
  ...lease,
  unit: {
    ...lease.unit,
    ownerships: [
      ...lease.unit.ownerships,
      { owner: b, ownerBankAccountId: "other" },
    ],
  },
};
assert.equal(contractLandlord(joint).owner, null);
assert.equal(
  contractLandlord({ ...joint, ownerBankAccountId: "account" }).owner?.id,
  a.id,
);
assert.equal(
  contractLandlord({ ...joint, ownerBankAccountId: "unrelated-bank-owner" })
    .owner,
  null,
);
const noUnit = { ...lease, unit: { ...lease.unit, ownerships: [] } };
assert.equal(contractLandlord(noUnit).owner, null);
assert.equal(
  contractLandlord({
    ...noUnit,
    unit: {
      ...noUnit.unit,
      property: { ...noUnit.unit.property, ownershipMode: "WHOLE_OBJECT" },
    },
  }).owner?.id,
  b.id,
);
assert.equal(
  contractLandlord({
    ...lease,
    landlordPeriods: [
      { fromPeriod: "2020-01", toPeriod: null, owner: a },
      { fromPeriod: "2020-01", toPeriod: null, owner: b },
    ],
  }).owner,
  null,
);
assert.notEqual(hashContent("a"), hashContent("b"));
assert.equal(hashContent("a"), hashContent(Buffer.from("a")));
assert.throws(() => actionKind("SIGN_EVERYTHING"));
assert.match(actionMeanings.RECEIVE, /není souhlasem/);
assert.match(actionMeanings.NON_RENEWAL, /Nevzdávám|nevzdávám/);
const notice = nonRenewalText({
  landlord: a.name,
  tenantNames: ["Jan", "Jana"],
  address: "Praha",
  endDate: "31. 10. 2027",
  handover: "Domluva 30. 10. v 16:00",
});
assert.match(notice, /Jan, Jana/);
assert.match(notice, /nájem nezkracuje/);
assert.match(notice, /nenahrazuje/);
assert.equal(
  packetStatus({
    kind: "SIGN",
    cancelledAt: null,
    recipients: [{ completedAt: new Date() }, { completedAt: null }],
  }),
  "Čeká na podpis (1/2)",
);
assert.equal(
  packetStatus({
    kind: "RECEIVE",
    cancelledAt: null,
    recipients: [{ completedAt: new Date() }],
  }),
  "Potvrzeno všemi",
);
console.log("Lease landlord selection and action semantics: PASS");
