import assert from "node:assert/strict";
import {meterNeedsReading,annualReadingWindow} from "../lib/meter-task-policy";
const now=new Date("2026-10-03T12:00:00Z");
assert.equal(meterNeedsReading(new Date("2026-07-05T12:00:00Z"),now,now),false);
assert.equal(meterNeedsReading(new Date("2026-07-04T12:00:00Z"),now,now),true);
assert.equal(meterNeedsReading(null,new Date("2026-07-04T12:00:00Z"),now),true);
assert.equal(annualReadingWindow(now),false);
assert.equal(annualReadingWindow(new Date("2026-12-01T12:00:00Z")),true);
console.log("Meter reminder boundaries passed");
