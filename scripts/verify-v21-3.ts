import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  currentLeaseForUnit,
  effectiveLeaseEnd,
  futureLeasesForUnit,
  leaseIntervalsOverlap,
  leaseStatusAt,
  pastLeasesForUnit,
} from "../lib/lease-lifecycle-core";

const now = new Date("2026-08-26T12:00:00Z");
const past = { startDate: new Date("2025-01-01T12:00:00Z"), endDate: new Date("2025-12-31T12:00:00Z") };
const active = { startDate: new Date("2026-01-01T12:00:00Z"), endDate: new Date("2026-08-31T12:00:00Z") };
const future = { startDate: new Date("2026-09-01T12:00:00Z"), endDate: new Date("2027-08-31T12:00:00Z") };
assert.equal(leaseStatusAt(past, now), "ENDED");
assert.equal(leaseStatusAt(active, now), "ACTIVE");
assert.equal(leaseStatusAt(future, now), "FUTURE");
assert.equal(currentLeaseForUnit([past, future, active], now), active);
assert.deepEqual(futureLeasesForUnit([future, past, active], now), [future]);
assert.deepEqual(pastLeasesForUnit([future, past, active], now), [past]);

const terminated = { startDate: new Date("2026-01-01T12:00:00Z"), endDate: new Date("2026-12-31T12:00:00Z"), terminatedOn: new Date("2026-08-26T12:00:00Z") };
assert.equal(leaseStatusAt(terminated, now), "ACTIVE", "Datum ukončení je včetně daného dne.");
assert.equal(leaseStatusAt(terminated, new Date("2026-08-27T12:00:00Z")), "ENDED");
assert.equal(effectiveLeaseEnd(terminated)?.toISOString(), "2026-08-26T12:00:00.000Z");
assert.equal(leaseStatusAt({ ...future, cancelledAt: now }, now), "ENDED");

assert.equal(leaseIntervalsOverlap(
  { startDate: new Date("2026-09-01T12:00:00Z"), endDate: new Date("2027-08-31T12:00:00Z") },
  { startDate: new Date("2027-01-01T12:00:00Z"), endDate: new Date("2027-12-31T12:00:00Z") },
), true);
assert.equal(leaseIntervalsOverlap(
  { startDate: new Date("2026-01-01T12:00:00Z"), endDate: new Date("2026-08-31T12:00:00Z") },
  { startDate: new Date("2026-09-01T12:00:00Z"), endDate: new Date("2027-08-31T12:00:00Z") },
), false, "Navazující smlouvy 31.8./1.9. se nepřekrývají.");
assert.equal(leaseIntervalsOverlap(
  { startDate: new Date("2026-01-01T12:00:00Z") },
  { startDate: new Date("2030-01-01T12:00:00Z") },
), true, "Dvě smlouvy na dobu neurčitou se překrývají.");

const leaseFields = readFileSync("components/LeaseCoreFields.tsx", "utf8");
assert.doesNotMatch(leaseFields, /name=["']status["']/);
assert.match(leaseFields, /Stav smlouvy se určuje automaticky/);

const unitEdit = readFileSync("app/nemovitosti/[id]/jednotky/[unitId]/upravit/page.tsx", "utf8");
assert.doesNotMatch(unitEdit, /name=["']status["']/);
assert.match(unitEdit, /operationalStatus/);

const tenantEdit = readFileSync("app/nemovitosti/[id]/najemnici/[tenantId]/upravit/page.tsx", "utf8");
assert.doesNotMatch(tenantEdit, /name=["']active["']/);

const createLease = readFileSync("app/api/properties/[id]/leases/route.ts", "utf8");
assert.match(createLease, /assertNoLeaseOverlap/);
assert.doesNotMatch(createLease, /text\(form,\s*["']status["']/);

const unitDetail = readFileSync("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx", "utf8");
assert.doesNotMatch(unitDetail, /\|\|\s*unit\.leases\[0\]/);
assert.match(unitDetail, /futureLeasesForUnit/);
assert.match(unitDetail, /Historie nájemních vztahů/);

const terminateRoute = "app/api/properties/[id]/leases/[leaseId]/terminate/route.ts";
assert.ok(existsSync(terminateRoute));
const terminate = readFileSync(terminateRoute, "utf8");
assert.match(terminate, /terminatedOn/);
assert.match(terminate, /cancelledAt/);
assert.match(terminate, /LEASE_TERMINATED/);
assert.match(terminate, /LEASE_CANCELLED/);

const migration = readFileSync("prisma/migrations/20260826190000_v21_3_lease_lifecycle/migration.sql", "utf8");
assert.match(migration, /EXCLUDE USING gist/);
assert.match(migration, /Lease_ownerBankAccountId_variableSymbol_key/);
assert.match(migration, /V21\.3 migration stopped: (?:existing Lease rows overlap|overlapping lease periods)/);

const matching = readFileSync("lib/matching.ts", "utf8");
assert.doesNotMatch(matching, /status:\s*\{\s*in:\s*\[\s*["']ACTIVE["'],\s*["']FUTURE["']/);

const scheduler = readFileSync("scripts/scheduler-cron.ts", "utf8");
assert.match(scheduler, /syncLifecycleCaches/);

console.log("FlatCloud V21.3 lease lifecycle verification OK");
