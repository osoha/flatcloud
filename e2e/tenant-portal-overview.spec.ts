import {expect, test} from "@playwright/test";
import {tenantPortalPaymentOverview} from "../lib/tenant-portal-payment-overview";
import {tenantPortalPaymentState, type PortalPaymentTone} from "../lib/tenant-portal-payment-state";

const row = (periodKey: string, tone: PortalPaymentTone, id = periodKey) => ({id, periodKey, tone});

test("compact overview is next month, current month and three paid months regardless of input order", () => {
  const rows = [row("2026-06", "paid"), row("2026-12", "scheduled"), row("2026-09", "paid"), row("2026-10", "current"), row("2026-07", "paid"), row("2026-11", "scheduled"), row("2026-08", "paid")];
  const original = [...rows];
  const result = tenantPortalPaymentOverview(rows, "2026-10");
  expect(result.compact.map(r => r.periodKey)).toEqual(["2026-11", "2026-10", "2026-09", "2026-08", "2026-07"]);
  expect(result.history.map(r => r.periodKey)).toEqual(["2026-12", "2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06"]);
  expect(rows).toEqual(original);
});

test("all overdue periods stay outside the truncated and filtered payment history without duplicates", () => {
  const rows = [row("2026-09", "overdue"), row("2026-10", "overdue"), row("2025-01", "overdue"), row("2026-11", "scheduled"), row("2026-08", "paid"), row("old-import", "neutral")];
  const result = tenantPortalPaymentOverview(rows, "2026-10");
  expect(result.overdue.map(r => r.periodKey)).toEqual(["2025-01", "2026-09", "2026-10"]);
  expect(result.compact.map(r => r.periodKey)).toEqual(["2026-11", "2026-08"]);
  expect(new Set([...result.overdue, ...result.history].map(r => r.id)).size).toBe(rows.length);
  expect(result.history.some(r => r.id === "old-import")).toBe(true);
});

test("paid current and next months retain calendar positions and green state across a year boundary", () => {
  const rows = [row("2026-12", "paid"), row("2026-11", "paid"), row("2027-01", "paid"), row("2027-02", "scheduled")];
  const result = tenantPortalPaymentOverview(rows, "2026-12");
  expect(result.compact.map(r => r.periodKey)).toEqual(["2027-01", "2026-12", "2026-11"]);
  expect(result.compact.every(r => r.tone === "paid")).toBe(true);
});

test("partial payments use the existing due-date state and remain visible as overdue after the deadline", () => {
  const charge = {period: "2026-10", dueDate: new Date("2026-10-05T12:00:00Z"), remainingCents: 80000, receivedCents: 20000, offsetCents: 0, debtTreatment: "CURRENT" as const};
  const before = tenantPortalPaymentState(charge, "2026-10-04");
  const after = tenantPortalPaymentState(charge, "2026-10-06");
  expect(before.tone).toBe("current");
  expect(after).toMatchObject({tone: "overdue", state: "Částečně · po splatnosti"});
  expect(tenantPortalPaymentOverview([row(charge.period, after.tone)], "2026-10").overdue).toHaveLength(1);
});

test("empty and missing current periods introduce no invented payment rows", () => {
  expect(tenantPortalPaymentOverview([], "2026-10").compact).toEqual([]);
  expect(tenantPortalPaymentOverview([row("2026-09", "paid")], "2026-10").compact.map(r => r.periodKey)).toEqual(["2026-09"]);
});
