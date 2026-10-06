import assert from "node:assert/strict";
import { contractOccupancy, unlistedContractTenants } from "../lib/lease-contracts/occupancy";
import { buildContract, contractInputSchema } from "../lib/lease-contracts/core";
import { contractLandlord } from "../lib/lease-contracts/landlord";
import { leaseContractFixture } from "../e2e/fixtures/lease-contract";

const at = (date: string) => new Date(`${date}T12:00:00Z`);
const source = {
  startDate: at("2026-11-01"),
  occupants: [{ name: "Jana Členová", active: true }, { name: "Bývalý člen", active: false }],
  occupancyPeriods: [
    { validFrom: at("2026-10-01"), validTo: at("2026-10-31"), personCount: 2 },
    { validFrom: at("2026-11-01"), validTo: at("2026-11-30"), personCount: 3 },
    { validFrom: at("2026-12-01"), validTo: null, personCount: 1 },
  ],
};
const prefill = contractOccupancy(source);
assert.equal(prefill.occupantCount, 3, "Use the period at tenancy start, not the latest count or number of contacts.");
assert.deepEqual(prefill.occupants, [{ name: "Jana Členová", birthDate: "", role: "Člen domácnosti" }]);
assert.equal(contractOccupancy({ ...source, startDate: at("2026-11-30") }).occupantCount, 3, "Period ends are inclusive.");
assert.equal(contractOccupancy({ ...source, startDate: at("2026-09-01") }).occupantCount, null, "Missing historical data requires a real value from the author.");
assert.equal(contractOccupancy({ ...source, occupancyPeriods: [...source.occupancyPeriods, { validFrom: at("2026-11-01"), validTo: null, personCount: 5 }] }).occupantCount, null, "Conflicting periods must not be resolved by guessing.");
assert.equal(contractOccupancy({ ...source, occupants: [] }).occupantCount, 3, "Names never change the recorded count.");
assert.equal(contractOccupancy({ ...source,startDate:new Date("2026-11-01T00:00:00+01:00") }).occupantCount,3,"A Prague-midnight start matches the same day's UTC-noon period, not the preceding UTC day.");
assert.equal(contractOccupancy({ ...source,startDate:at("2026-11-30"),occupancyPeriods:[{validFrom:new Date("2026-11-01T00:00:00+01:00"),validTo:new Date("2026-11-30T00:00:00+01:00"),personCount:3}] }).occupantCount,3,"A Prague-midnight end includes its entire business date.");
assert.equal(contractOccupancy({ ...source,startDate:new Date("2026-10-25T00:00:00+02:00"),occupancyPeriods:[{validFrom:at("2026-10-25"),validTo:at("2026-10-25"),personCount:4}] }).occupantCount,4,"Prague calendar days remain stable across the autumn DST transition.");
const previousOwner={id:"previous",name:"Předchozí vlastník",type:"PERSON",ico:null,address:null,email:null,phone:null};
const currentOwner={...previousOwner,id:"current",name:"Současný vlastník"};
assert.equal(contractLandlord({startDate:new Date("2026-10-01T00:00:00+02:00"),ownerBankAccountId:null,landlordPeriods:[{fromPeriod:"2026-01",toPeriod:"2026-09",owner:previousOwner},{fromPeriod:"2026-10",toPeriod:null,owner:currentOwner}],unit:{ownerships:[],property:{owner:currentOwner,ownershipMode:"WHOLE_OBJECT",ownerships:[]}}}).owner?.id,"current","A contract starting at Prague midnight on the first of the month selects that month's landlord.");
const namedTenant={name:"Jan Novák",birthDate:"1990-01-01"};
assert.deepEqual(unlistedContractTenants([namedTenant],[{name:" Jan   Novák ",birthDate:""}]),[],"An unknown birthday must not cause a duplicate or inferred identity.");
assert.deepEqual(unlistedContractTenants([namedTenant],[{...namedTenant}]),[]);
assert.deepEqual(unlistedContractTenants([namedTenant],[{...namedTenant,birthDate:"1960-01-01"}]),[namedTenant],"Known different birth dates preserve two different people with the same name.");

const contract = buildContract({ ...leaseContractFixture, ...prefill });
assert.deepEqual(contract.input.occupants, prefill.occupants);
assert.match(contract.cover.find(([label]) => label === "Osoby v bytě")![1], /Jana Členová/);
assert.match(contract.cover.find(([label]) => label === "Osoby v bytě")![1], /Seznam obsahuje 1 z 3 osob/);
assert(!contract.cover.find(([label]) => label === "Osoby v bytě")![1].includes(leaseContractFixture.tenants[0].name), "Contracting parties are not assumed to be residents.");
assert(!contractInputSchema.safeParse({ ...leaseContractFixture, occupantCount: 1, occupants: [{ name: "První osoba" }, { name: "Druhá osoba" }] }).success);
const invalidBirth = contractInputSchema.safeParse({ ...leaseContractFixture, occupants: [{ name: "Jana", birthDate: "2030-01-01" }] });
assert(!invalidBirth.success);
assert.equal(invalidBirth.error.issues[0].path.join("."), "occupants.0.birthDate");
assert(contractInputSchema.safeParse({ ...leaseContractFixture, occupants: [{ name: "Jana" }] }).success, "Household birth dates and roles remain optional.");
assert(!contractInputSchema.safeParse({ ...leaseContractFixture,occupantCount:2,occupants:[namedTenant,{...namedTenant,name:" Jan  Novák "}] }).success,"Repeated known identities cannot inflate the list.");
assert.match(buildContract(leaseContractFixture).cover.find(([label]) => label === "Osoby v bytě")![1], /Jmenný seznam osob není uveden/);
console.log("PASS: historical occupant counts, missing/ambiguous periods, explicit resident names, optional birth dates and backwards-compatible snapshots.");
