import { prisma } from "./db";

export async function appSettings() {
  return prisma.appSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global", automaticBankSync: true, bankSyncsPerDay: 24 },
  });
}

export function syncIntervalHours(syncsPerDay: number) {
  const safe = Math.max(1, Math.min(24, Math.round(syncsPerDay)));
  return 24 / safe;
}

export function accountIsDue(lastSyncedAt: Date | null, syncsPerDay: number, now = new Date()) {
  if (!lastSyncedAt) return true;
  return now.getTime() - lastSyncedAt.getTime() >= syncIntervalHours(syncsPerDay) * 60 * 60 * 1000 - 5 * 60 * 1000;
}
