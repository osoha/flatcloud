import { prisma } from "@/lib/db";
import { ONLINE_WINDOW_MS } from "@/lib/user-activity-policy";

const DAY = 86_400_000;
export async function loadSystemCounts(now = new Date()) {
  const [users, activeUsers, testUsers, properties, units] = await prisma.$transaction([
    prisma.user.count({ where: { isTestIdentity: false } }),
    prisma.user.count({ where: { active: true, isTestIdentity: false, activity: { lastSeenAt: { gt: new Date(now.getTime() - 30 * DAY), lte: now } } } }),
    prisma.user.count({ where: { isTestIdentity: true } }),
    prisma.property.count({ where: { active: true } }),
    prisma.unit.count({ where: { property: { active: true }, operationalStatus: { not: "INACTIVE" } } }),
  ], { isolationLevel: "RepeatableRead" });
  return { users, activeUsers, testUsers, properties, units };
}

// The scheduler records days even when nobody opens the drawer. On-demand fallback
// covers installations without a scheduler. Missing days are never backfilled.
export async function captureSystemDailySnapshot(now = new Date(), counts?: Awaited<ReturnType<typeof loadSystemCounts>>) {
  const day = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const existing = await prisma.systemDailySnapshot.findUnique({ where: { day } });
  if (existing) return existing;
  const values = counts ?? await loadSystemCounts(now);
  await prisma.systemDailySnapshot.createMany({ data: [{ day, capturedAt: now, ...values }], skipDuplicates: true });
  return prisma.systemDailySnapshot.findUniqueOrThrow({ where: { day } });
}

export async function loadAdminOperations() {
  const now = new Date();
  const counts = await loadSystemCounts(now);
  const [online, invitations, inboxErrors, failedEmails, archivedProperties, inactiveUnits, files, deletedFiles, scheduler, mf, csu, average, databaseSize] = await Promise.all([
    prisma.userActivity.count({ where: { user: { active: true, isTestIdentity: false }, lastSeenAt: { gt: new Date(now.getTime() - ONLINE_WINDOW_MS), lte: now } } }),
    prisma.userInvitation.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    prisma.inboxPayment.count({ where: { status: "ERROR" } }),
    prisma.rentNotification.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - DAY) } } }),
    prisma.property.count({ where: { active: false } }),
    prisma.unit.count({ where: { OR: [{ property: { active: false } }, { operationalStatus: "INACTIVE" }] } }),
    prisma.fileAsset.aggregate({ where: { deletedAt: null }, _count: true, _sum: { sizeBytes: true } }),
    prisma.fileAsset.aggregate({ where: { deletedAt: { not: null } }, _count: true, _sum: { sizeBytes: true } }),
    prisma.auditLog.findFirst({ where: { action: { in: ["SCHEDULER_CRON", "SCHEDULER_CRON_FAILED"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, action: true, details: true } }),
    prisma.mfRentDatasetRelease.findFirst({ orderBy: [{ marketYear: "desc" }, { marketQuarter: "desc" }], select: { marketYear: true, marketQuarter: true, importedAt: true } }),
    prisma.csuApartmentPriceIndex.findFirst({ orderBy: [{ marketYear: "desc" }, { marketQuarter: "desc" }], select: { marketYear: true, marketQuarter: true, importedAt: true } }),
    prisma.csuApartmentAverage.findFirst({ orderBy: { sourcePeriod: "desc" }, select: { sourcePeriod: true, importedAt: true } }),
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`.then(rows => rows[0] ? Number(rows[0].bytes) : null).catch(() => null),
  ]);
  let snapshotAvailable = true;
  await captureSystemDailySnapshot(now, counts).catch(() => { snapshotAvailable = false; });
  const history = await prisma.systemDailySnapshot.findMany({ where: { day: { gte: new Date(now.getTime() - 90 * DAY), lte: now } }, orderBy: { day: "asc" } }).catch(() => { snapshotAvailable = false; return []; });
  const details = scheduler?.details as { steps?: { name?: string; status?: string }[] } | null;
  const failedSteps = Array.isArray(details?.steps) ? details.steps.filter(step => step.status === "failed").map(step => step.name || "unknown") : [];
  const schedulerState = !scheduler ? "unknown" : now.getTime() - scheduler.createdAt.getTime() > 26 * 3_600_000 ? "stale" : scheduler.action === "SCHEDULER_CRON_FAILED" || failedSteps.length ? "failed" : "ok";
  return {
    ...counts, online, invitations, inboxErrors, failedEmails, archivedProperties, inactiveUnits,
    asOf: now.toISOString(), databaseSize,
    files: { count: files._count, bytes: files._sum.sizeBytes ?? 0, deletedCount: deletedFiles._count, deletedBytes: deletedFiles._sum.sizeBytes ?? 0 },
    scheduler: { state: schedulerState, lastRun: scheduler?.createdAt.toISOString() ?? null, failedSteps },
    imports: { mf, csu, average }, snapshotAvailable,
    history: history.map(row => ({ ...row, day: row.day.toISOString().slice(0, 10), capturedAt: row.capturedAt.toISOString() })),
  };
}
export type AdminOperations = Awaited<ReturnType<typeof loadAdminOperations>>;
