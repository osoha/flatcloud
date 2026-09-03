import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateLiveOccupancyTrend } from "../lib/reporting/live-occupancy-trend";
import { monthEndAsOf, parseLiveReportPeriodRange } from "../lib/reporting/live-period";

let count = 0;
function check(name: string, run: () => void) {
  run();
  console.log(`✓ ${++count}. ${name}`);
}
const now = new Date("2026-09-03T12:00:00Z");

check("rolling 12 months is the safe default", () => {
  const range = parseLiveReportPeriodRange({}, now);
  assert.equal(range.mode, "rolling12");
  assert.equal(range.periods.length, 12);
  assert.deepEqual([range.from, range.to], ["2025-10", "2026-09"]);
});

check("YTD starts in January and ends in the current month", () => {
  const range = parseLiveReportPeriodRange({ range: "ytd" }, now);
  assert.equal(range.periods.length, 9);
  assert.deepEqual([range.from, range.to], ["2026-01", "2026-09"]);
});

check("valid custom month range is inclusive", () => {
  const range = parseLiveReportPeriodRange({ range: "custom", from: "2025-11", to: "2026-02" }, now);
  assert.deepEqual(range.periods, ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

check("future, reversed and overlong custom ranges fail closed to 12M", () => {
  for (const query of [
    { range: "custom", from: "2026-10", to: "2026-11" },
    { range: "custom", from: "2026-08", to: "2026-02" },
    { range: "custom", from: "2020-01", to: "2026-09" },
  ]) assert.equal(parseLiveReportPeriodRange(query, now).mode, "rolling12");
});

check("past periods use month end and current period uses LIVE as-of", () => {
  assert.equal(monthEndAsOf("2026-08", now).toISOString(), "2026-08-31T12:00:00.000Z");
  assert.equal(monthEndAsOf("2026-09", now), now);
});

check("occupancy follows lease lifecycle at each month end", () => {
  const points = calculateLiveOccupancyTrend([{
    operationalStatusEvents: [{ status: "STANDARD", effectiveAt: new Date("2025-01-01T12:00:00Z") }],
    leases: [{ startDate: new Date("2026-03-01T12:00:00Z"), endDate: new Date("2026-06-30T12:00:00Z") }],
  }], ["2026-02", "2026-03", "2026-06", "2026-07"], now);
  assert.deepEqual(points.map((point) => point.occupancyBps), [0, 10_000, 10_000, 0]);
  assert.deepEqual(points.map((point) => point.vacant), [1, 0, 0, 1]);
});

check("unknown operational history remains an explicit gap", () => {
  const points = calculateLiveOccupancyTrend([{
    operationalStatusEvents: [{ status: "STANDARD", effectiveAt: new Date("2026-05-01T12:00:00Z") }],
    leases: [],
  }], ["2026-04", "2026-05"], now);
  assert.equal(points[0].occupancyBps, null);
  assert.equal(points[0].unknown, 1);
  assert.equal(points[1].occupancyBps, 0);
});

check("renovation and inactive periods are excluded from the rentable denominator", () => {
  const points = calculateLiveOccupancyTrend([{
    operationalStatusEvents: [
      { status: "STANDARD", effectiveAt: new Date("2026-01-01T12:00:00Z") },
      { status: "RENOVATION", effectiveAt: new Date("2026-08-01T12:00:00Z") },
    ],
    leases: [],
  }], ["2026-07", "2026-08"], now);
  assert.equal(points[0].rentable, 1);
  assert.equal(points[1].rentable, 0);
  assert.equal(points[1].occupancyBps, null);
});

check("live reports expose both charts and preserve range with portfolio scope", () => {
  const page = fs.readFileSync("app/reporty/page.tsx", "utf8");
  const picker = fs.readFileSync("components/ReportPeriodPicker.tsx", "utf8");
  const chart = fs.readFileSync("components/ReportChart.tsx", "utf8");
  for (const token of ["OccupancyChart", "ReportPeriodPicker", "rangeSuffix", "occupancyTrend"]) assert.ok(page.includes(token), token);
  for (const token of ["rolling12", "ytd", "custom", "properties"]) assert.ok(picker.includes(token), token);
  assert.ok(chart.includes("Chybějící historie"));
});

console.log(`Live report periods: ${count}/${count} checks green.`);
