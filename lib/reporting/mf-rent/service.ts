import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  discoverOfficialMfReleases,
  downloadOfficialXlsx,
  type MfFetch,
  type MfSourceRelease,
} from "./source";
import {
  MF_RENT_PARSER_VERSION,
  parseMfRentWorkbook,
} from "./parser";
import { mfRentTerritoryDataSchema } from "./schema";
const FRESH_MS = 24 * 60 * 60 * 1000;
export const MF_RENT_IMPORT_TRANSACTION_MAX_WAIT_MS = 10_000;
export const MF_RENT_IMPORT_TRANSACTION_TIMEOUT_MS = 60_000;
export const MF_RENT_IMPORT_BATCH_SIZE = 1_000;
type ParsedMfRentWorkbook = Awaited<ReturnType<typeof parseMfRentWorkbook>>;
const MF_RENT_FAILED_SYNC_SUMMARY =
  "Neúspěšná kontrola: import dat MF se nepodařilo dokončit. Dříve importovaná data zůstávají aktivní.";
export type MfSyncResult = {
  enabled: true;
  status: "skipped" | "ok" | "failed";
  discoveredReleaseCount: number;
  newImports: number;
  idempotentSkips: number;
  territoryCounts: number[];
  latestOfficialMarketPeriod: string | null;
  summary: string;
};
export function selectBootstrapReleases(
  releases: MfSourceRelease[],
  hasAny: boolean,
) {
  if (hasAny) return releases.slice(0, 8);
  const current = releases.find((r) => r.current);
  const historical = releases.filter((r) => !r.current);
  const distinct = new Map<string, MfSourceRelease>();
  for (const r of historical) {
    const key = `${r.marketYear}-${r.marketQuarter}`;
    if (!distinct.has(key)) distinct.set(key, r);
  }
  return [current, ...distinct.values()]
    .filter(Boolean)
    .slice(0, 8) as MfSourceRelease[];
}
export async function importParsedMfRentRelease({
  release,
  sourceSha256,
  parsed,
  importedById,
}: {
  release: MfSourceRelease;
  sourceSha256: string;
  parsed: ParsedMfRentWorkbook;
  importedById?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const created = await tx.mfRentDatasetRelease.create({
        data: {
          sourceUrl: release.url,
          sourceSha256,
          sourceFileName: release.fileName,
          publishedOn: release.publishedOn,
          marketYear: release.marketYear,
          marketQuarter: release.marketQuarter,
          parserVersion: MF_RENT_PARSER_VERSION,
          schemaFingerprint: parsed.schemaFingerprint,
          importedById,
        },
      });
      for (
        let i = 0;
        i < parsed.territories.length;
        i += MF_RENT_IMPORT_BATCH_SIZE
      )
        await tx.mfRentTerritorySnapshot.createMany({
          data: parsed.territories
            .slice(i, i + MF_RENT_IMPORT_BATCH_SIZE)
            .map((territory) => ({
              ...territory,
              releaseId: created.id,
              data: territory.data as Prisma.InputJsonValue,
            })),
        });
      return created;
    },
    {
      maxWait: MF_RENT_IMPORT_TRANSACTION_MAX_WAIT_MS,
      timeout: MF_RENT_IMPORT_TRANSACTION_TIMEOUT_MS,
    },
  );
}
export async function syncMfRentDatasets(
  options: {
    force?: boolean;
    fetcher?: MfFetch;
    importedById?: string;
    now?: Date;
  } = {},
): Promise<MfSyncResult> {
  const now = options.now ?? new Date();
  const settings = await prisma.appSetting.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });
  if (
    !options.force &&
    settings.mfRentLastCheckedAt &&
    now.getTime() - settings.mfRentLastCheckedAt.getTime() < FRESH_MS
  )
    return {
      enabled: true,
      status: "skipped",
      discoveredReleaseCount: 0,
      newImports: 0,
      idempotentSkips: 0,
      territoryCounts: [],
      latestOfficialMarketPeriod: null,
      summary: "Kontrola MF byla úspěšně provedena během posledních 24 hodin.",
    };
  await prisma.appSetting.update({
    where: { id: "global" },
    data: { mfRentLastCheckedAt: now },
  });
  try {
    const discovered = await discoverOfficialMfReleases(options.fetcher);
    const hasAny = (await prisma.mfRentDatasetRelease.count()) > 0;
    const releases = selectBootstrapReleases(discovered, hasAny);
    let newImports = 0,
      idempotentSkips = 0;
    const territoryCounts: number[] = [];
    for (const release of releases) {
      const known = await prisma.mfRentDatasetRelease.findFirst({
        where: { sourceUrl: release.url },
        select: { sourceSha256: true },
      });
      if (known && !options.force) {
        idempotentSkips++;
        continue;
      }
      const bytes = await downloadOfficialXlsx(release.url, options.fetcher);
      const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
      if (
        await prisma.mfRentDatasetRelease.findUnique({
          where: { sourceSha256 },
        })
      ) {
        idempotentSkips++;
        continue;
      }
      const parsed = await parseMfRentWorkbook(bytes);
      await importParsedMfRentRelease({
        release,
        sourceSha256,
        parsed,
        importedById: options.importedById,
      });
      newImports++;
      territoryCounts.push(parsed.territories.length);
    }
    const latest = await prisma.mfRentDatasetRelease.findFirst({
      orderBy: [
        { marketYear: "desc" },
        { marketQuarter: "desc" },
        { publishedOn: "desc" },
        { importedAt: "desc" },
      ],
    });
    const latestPeriod = latest
      ? `Q${latest.marketQuarter} ${latest.marketYear}`
      : null;
    const summary = `Nalezeno ${discovered.length} příloh, importováno ${newImports}, beze změny ${idempotentSkips}.`;
    await prisma.appSetting.update({
      where: { id: "global" },
      data: { mfRentLastSuccessAt: now, mfRentLastSummary: summary },
    });
    return {
      enabled: true,
      status: "ok",
      discoveredReleaseCount: discovered.length,
      newImports,
      idempotentSkips,
      territoryCounts,
      latestOfficialMarketPeriod: latestPeriod,
      summary,
    };
  } catch (error) {
    console.error("MF rent dataset synchronization failed.", {
      errorClass: error instanceof Error ? error.name : "UnknownError",
      error,
    });
    await prisma.appSetting.update({
      where: { id: "global" },
      data: { mfRentLastSummary: MF_RENT_FAILED_SYNC_SUMMARY },
    });
    throw new Error("Synchronizace dat MF se nezdařila.");
  }
}
export async function resolveMfRentRelease({
  targetYear,
  targetQuarter,
  cutoff,
}: {
  targetYear: number;
  targetQuarter: number;
  cutoff: Date;
}) {
  if (targetQuarter < 1 || targetQuarter > 4)
    throw new Error("Neplatné čtvrtletí.");
  return prisma.mfRentDatasetRelease.findFirst({
    where: {
      publishedOn: { lte: cutoff },
      OR: [
        { marketYear: { lt: targetYear } },
        { marketYear: targetYear, marketQuarter: { lte: targetQuarter } },
      ],
    },
    orderBy: [
      { marketYear: "desc" },
      { marketQuarter: "desc" },
      { publishedOn: "desc" },
      { importedAt: "desc" },
      { id: "desc" },
    ],
  });
}
export async function resolvePropertyMfRentBenchmarks(args: {
  propertyId: string;
  targetYear: number;
  targetQuarter: number;
  cutoff: Date;
}) {
  const mapping = await prisma.propertyMfRentLocation.findUnique({
    where: { propertyId: args.propertyId },
  });
  if (!mapping)
    return {
      mapping: null,
      release: null,
      vk1: null,
      vk2: null,
      vk3: null,
      vk4: null,
    };
  const release = await resolveMfRentRelease(args);
  if (!release)
    return {
      mapping,
      release: null,
      vk1: null,
      vk2: null,
      vk3: null,
      vk4: null,
    };
  const snapshot = await prisma.mfRentTerritorySnapshot.findUnique({
    where: {
      releaseId_territoryCode: {
        releaseId: release.id,
        territoryCode: mapping.territoryCode,
      },
    },
  });
  if (!snapshot)
    return { mapping, release, vk1: null, vk2: null, vk3: null, vk4: null };
  const data = mfRentTerritoryDataSchema.parse(snapshot.data);
  return {
    mapping,
    release,
    vk1: data.vk1,
    vk2: data.vk2,
    vk3: data.vk3,
    vk4: data.vk4,
  };
}
