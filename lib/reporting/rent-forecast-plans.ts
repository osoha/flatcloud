import { randomUUID } from "node:crypto";
import { Prisma, PropertyPermission } from "@prisma/client";
import { z } from "zod";
import { hasAllPropertyAccess } from "../auth";
import { prisma } from "../db";
import { serializableTransaction } from "../serializable";
import { loadLiveReport } from "./live-service";
import { calculateRentForecastWithAssumptions, type RentForecastAssumptions, type RentForecastInput } from "./rent-forecast";

type Actor = { id: string; role: string; allProperties?: boolean };

const snapshotRowSchema = z.object({
  leaseId: z.string().min(1), propertyId: z.string().min(1), propertyName: z.string(), unitId: z.string().min(1), unitLabel: z.string(),
  currentRentCents: z.number().int().nonnegative(), effectiveEnd: z.string().datetime().nullable(), indexationEnabled: z.boolean(),
  indexationPercentBps: z.number().int().nullable(), nextIndexationAt: z.string().datetime().nullable(), mfMarketRentCents: z.number().int().nonnegative().nullable(),
});
const inputSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.array(z.object({ propertyId: z.string().min(1), propertyName: z.string() })).min(1),
  mfReferencePeriod: z.string(),
  rows: z.array(snapshotRowSchema),
});

export type RentForecastPlanSnapshot = z.infer<typeof inputSnapshotSchema>;
export const rentForecastPlanStatuses = { DRAFT: "Koncept", APPROVED: "Schváleno", ARCHIVED: "Archivováno" } as const;

function uniquePropertyIds(propertyIds: string[]) { return [...new Set(propertyIds.map((id) => id.trim()).filter(Boolean))]; }
function planAccessWhere(actor: Actor): Prisma.RentForecastPlanWhereInput | undefined {
  if (hasAllPropertyAccess(actor)) return undefined;
  return { properties: { some: {}, every: { property: { memberships: { some: { userId: actor.id } } } } } };
}
async function requirePropertyScope(actor: Actor, rawPropertyIds: string[], minimum: PropertyPermission) {
  const propertyIds = uniquePropertyIds(rawPropertyIds);
  if (!propertyIds.length) throw new Error("Vyberte alespoň jednu nemovitost.");
  const existing = await prisma.property.count({ where: { id: { in: propertyIds } } });
  if (existing !== propertyIds.length) throw new Error("Některá z vybraných nemovitostí nebyla nalezena.");
  if (hasAllPropertyAccess(actor)) return propertyIds;
  const allowed = await prisma.userProperty.count({ where: { userId: actor.id, propertyId: { in: propertyIds }, permission: minimum === "VIEW" ? { in: ["VIEW", "EDIT", "ADMIN"] } : { in: ["EDIT", "ADMIN"] } } });
  if (allowed !== propertyIds.length) throw new Error(minimum === "VIEW" ? "K tomuto scénáři nemáte přístup." : "Uložení a schválení vyžaduje právo upravovat všechny vybrané nemovitosti.");
  return propertyIds;
}
function serializedRows(rows: RentForecastInput[]) {
  return rows.map((row) => ({ ...row, effectiveEnd: row.effectiveEnd?.toISOString() ?? null, nextIndexationAt: row.nextIndexationAt?.toISOString() ?? null }));
}
async function captureLiveSnapshot(actor: Actor, propertyIds: string[], asOfDate: Date) {
  const report = await loadLiveReport(actor, { mode: "SELECTED", propertyIds }, asOfDate);
  const loadedIds = report.properties.map((property) => property.id).sort();
  if (loadedIds.join("|") !== [...propertyIds].sort().join("|")) throw new Error("Rozsah scénáře se nepodařilo bezpečně ověřit.");
  const mfByUnit = new Map(report.mfBenchmark.rows.map((row) => [row.unitId, row.marketComparableRentCents]));
  const rows: RentForecastInput[] = report.tenancyRows.map((row) => ({ leaseId: row.leaseId, propertyId: row.propertyId, propertyName: row.propertyName, unitId: row.unitId, unitLabel: row.unitLabel, currentRentCents: row.netRentCents, effectiveEnd: row.endDate, indexationEnabled: row.indexationEnabled, indexationPercentBps: row.indexationPercentBps, nextIndexationAt: row.nextIndexationAt, mfMarketRentCents: mfByUnit.get(row.unitId) ?? null }));
  const snapshot: RentForecastPlanSnapshot = { schemaVersion: 1, scope: report.properties.map((property) => ({ propertyId: property.id, propertyName: property.name })), mfReferencePeriod: report.mfBenchmark.release ? `Q${report.mfBenchmark.release.marketQuarter} ${report.mfBenchmark.release.marketYear}` : "Nedostupná", rows: serializedRows(rows) };
  return snapshot;
}
export function parseRentForecastPlanSnapshot(value: Prisma.JsonValue): RentForecastPlanSnapshot { return inputSnapshotSchema.parse(value); }
export function snapshotForecastRows(snapshot: RentForecastPlanSnapshot): RentForecastInput[] {
  return snapshot.rows.map((row) => ({ ...row, effectiveEnd: row.effectiveEnd ? new Date(row.effectiveEnd) : null, nextIndexationAt: row.nextIndexationAt ? new Date(row.nextIndexationAt) : null }));
}
export function calculateSavedRentForecast(plan: { name: string; asOfDate: Date; horizonMonths: number; annualGrowthBps: number; vacancyBps: number; collectionBps: number; marketGapCaptureBps: number; inputSnapshot: Prisma.JsonValue }) {
  const snapshot = parseRentForecastPlanSnapshot(plan.inputSnapshot);
  return calculateRentForecastWithAssumptions(snapshotForecastRows(snapshot), plan.asOfDate, "saved", { label: plan.name, annualGrowthBps: plan.annualGrowthBps, vacancyBps: plan.vacancyBps, collectionBps: plan.collectionBps, marketGapCaptureBps: plan.marketGapCaptureBps }, plan.horizonMonths);
}

const planInclude = { properties: { include: { property: { select: { id: true, name: true } } }, orderBy: { property: { name: "asc" as const } } }, createdBy: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } } satisfies Prisma.RentForecastPlanInclude;

export async function listAccessibleRentForecastPlans(actor: Actor) {
  return prisma.rentForecastPlan.findMany({ where: planAccessWhere(actor), include: planInclude, orderBy: [{ updatedAt: "desc" }, { revision: "desc" }], take: 30 });
}
export async function loadAccessibleRentForecastPlan(actor: Actor, planId: string) {
  const plan = await prisma.rentForecastPlan.findFirst({ where: { id: planId, AND: planAccessWhere(actor) }, include: planInclude });
  if (!plan) throw new Error("Scénář nebyl nalezen nebo k němu nemáte přístup.");
  parseRentForecastPlanSnapshot(plan.inputSnapshot);
  return plan;
}
export async function listAccessibleRentForecastPlanRevisions(actor: Actor, seriesId: string) {
  return prisma.rentForecastPlan.findMany({ where: { seriesId, AND: planAccessWhere(actor) }, include: planInclude, orderBy: { revision: "desc" } });
}
export async function canManageRentForecastPlan(actor: Actor, propertyIds: string[]) {
  try { await requirePropertyScope(actor, propertyIds, PropertyPermission.EDIT); return true; } catch { return false; }
}

function validateAssumptions(assumptions: RentForecastAssumptions) {
  const values: Array<[string, number, number]> = [["Roční růst", assumptions.annualGrowthBps, 2_000], ["Vacancy", assumptions.vacancyBps, 10_000], ["Úspěšnost inkasa", assumptions.collectionBps, 10_000], ["Využití MF rozdílu", assumptions.marketGapCaptureBps, 10_000]];
  for (const [label, value, maximum] of values) if (!Number.isInteger(value) || value < 0 || value > maximum) throw new Error(`${label} je mimo povolený rozsah.`);
}

export async function createRentForecastPlan(input: { name: string; note?: string | null; propertyIds: string[]; horizonMonths: number; assumptions: RentForecastAssumptions }, actor: Actor) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("Název scénáře musí mít 1 až 120 znaků.");
  if (![12, 24, 36].includes(input.horizonMonths)) throw new Error("Horizont musí být 12, 24 nebo 36 měsíců.");
  const propertyIds = await requirePropertyScope(actor, input.propertyIds, PropertyPermission.EDIT);
  validateAssumptions(input.assumptions);
  const asOfDate = new Date();
  const snapshot = await captureLiveSnapshot(actor, propertyIds, asOfDate);
  const plan = await prisma.rentForecastPlan.create({ data: { seriesId: randomUUID(), revision: 1, name, asOfDate, horizonMonths: input.horizonMonths, annualGrowthBps: input.assumptions.annualGrowthBps, vacancyBps: input.assumptions.vacancyBps, collectionBps: input.assumptions.collectionBps, marketGapCaptureBps: input.assumptions.marketGapCaptureBps, inputSnapshot: snapshot as Prisma.InputJsonValue, note: input.note?.trim() || null, createdById: actor.id, properties: { create: propertyIds.map((propertyId) => ({ propertyId })) } } });
  await prisma.auditLog.createMany({ data: propertyIds.map((propertyId) => ({ userId: actor.id, propertyId, action: "RENT_FORECAST_PLAN_CREATED", entityType: "RentForecastPlan", entityId: plan.id, details: { seriesId: plan.seriesId, revision: plan.revision } })) });
  return plan;
}

export async function approveRentForecastPlan(planId: string, actor: Actor) {
  const source = await loadAccessibleRentForecastPlan(actor, planId);
  const propertyIds = await requirePropertyScope(actor, source.properties.map((row) => row.propertyId), PropertyPermission.EDIT);
  if (source.status !== "DRAFT") throw new Error("Schválit lze pouze scénář ve stavu Koncept.");
  return serializableTransaction(async (tx) => {
    const changed = await tx.rentForecastPlan.updateMany({ where: { id: planId, status: "DRAFT" }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() } });
    if (changed.count !== 1) throw new Error("Scénář již mezitím změnil stav. Obnovte stránku.");
    await tx.auditLog.createMany({ data: propertyIds.map((propertyId) => ({ userId: actor.id, propertyId, action: "RENT_FORECAST_PLAN_APPROVED", entityType: "RentForecastPlan", entityId: planId, details: { seriesId: source.seriesId, revision: source.revision, writesToLeases: false } })) });
    return tx.rentForecastPlan.findUniqueOrThrow({ where: { id: planId } });
  });
}

export async function createRentForecastPlanRevision(planId: string, actor: Actor) {
  const source = await loadAccessibleRentForecastPlan(actor, planId);
  const propertyIds = await requirePropertyScope(actor, source.properties.map((row) => row.propertyId), PropertyPermission.EDIT);
  if (source.status !== "APPROVED") throw new Error("Novou revizi lze vytvořit pouze ze schváleného scénáře.");
  const asOfDate = new Date();
  const snapshot = await captureLiveSnapshot(actor, propertyIds, asOfDate);
  return serializableTransaction(async (tx) => {
    const existingDraft = await tx.rentForecastPlan.findFirst({ where: { seriesId: source.seriesId, status: "DRAFT" }, select: { id: true } });
    if (existingDraft) throw new Error("Tato řada již má rozpracovanou revizi.");
    const latest = await tx.rentForecastPlan.aggregate({ where: { seriesId: source.seriesId }, _max: { revision: true } });
    const revision = (latest._max.revision || 0) + 1;
    const plan = await tx.rentForecastPlan.create({ data: { seriesId: source.seriesId, revision, name: source.name, status: "DRAFT", asOfDate, horizonMonths: source.horizonMonths, annualGrowthBps: source.annualGrowthBps, vacancyBps: source.vacancyBps, collectionBps: source.collectionBps, marketGapCaptureBps: source.marketGapCaptureBps, inputSnapshot: snapshot as Prisma.InputJsonValue, note: source.note, createdById: actor.id, properties: { create: propertyIds.map((propertyId) => ({ propertyId })) } } });
    await tx.auditLog.createMany({ data: propertyIds.map((propertyId) => ({ userId: actor.id, propertyId, action: "RENT_FORECAST_PLAN_REVISION_CREATED", entityType: "RentForecastPlan", entityId: plan.id, details: { seriesId: plan.seriesId, revision, sourcePlanId: source.id } })) });
    return plan;
  });
}

export function rentForecastPlanErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return "Uložený snapshot scénáře je poškozený nebo nekompatibilní.";
  return error instanceof Error ? error.message : "Scénář se nepodařilo zpracovat.";
}
