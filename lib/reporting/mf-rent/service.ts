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
import { readPropertyTechnicalData } from "@/lib/property-technical";
import { selectMfTerritoryFromPropertyData } from "./property-location";
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
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const releaseRow = await tx.mfRentDatasetRelease.create({
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
                releaseId: releaseRow.id,
                data: territory.data as Prisma.InputJsonValue,
              })),
          });
        return releaseRow;
      },
      {
        maxWait: MF_RENT_IMPORT_TRANSACTION_MAX_WAIT_MS,
        timeout: MF_RENT_IMPORT_TRANSACTION_TIMEOUT_MS,
      },
    );
    return { status: "imported" as const, release: created };
  } catch (error) {
    if (!isMfRentReleaseSourceShaCollision(error)) throw error;

    // This query deliberately runs after $transaction rejected and rolled back.
    const existing = await prisma.mfRentDatasetRelease.findUnique({
      where: { sourceSha256 },
    });
    if (!existing) throw error;
    return { status: "already_imported" as const, release: existing };
  }
}

export function isMfRentReleaseSourceShaCollision(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  )
    return false;
  const modelName = error.meta?.modelName;
  if (modelName !== undefined && modelName !== "MfRentDatasetRelease")
    return false;
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.length === 1 && target[0] === "sourceSha256"
    : target === "sourceSha256";
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
      const result = await importParsedMfRentRelease({
        release,
        sourceSha256,
        parsed,
        importedById: options.importedById,
      });
      if (result.status === "already_imported") idempotentSkips++;
      else {
        newImports++;
        territoryCounts.push(parsed.territories.length);
      }
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
  const release = await resolveMfRentRelease(args);
  const [explicitMapping, property] = await Promise.all([
    prisma.propertyMfRentLocation.findUnique({
      where: { propertyId: args.propertyId },
    }),
    prisma.property.findUnique({
      where: { id: args.propertyId },
      select: { city: true, technicalData: true },
    }),
  ]);
  const cadastralArea = readPropertyTechnicalData(property?.technicalData).cadastralArea;
  let locationSource: "EXPLICIT" | "PROPERTY_CADASTRAL_DATA" | null = explicitMapping
    ? "EXPLICIT"
    : null;
  let mapping: {
    propertyId: string;
    territoryCode: string;
    territoryName: string;
    municipalityName: string | null;
  } | null = explicitMapping;

  if (!mapping && release && cadastralArea) {
    const candidates = await prisma.mfRentTerritorySnapshot.findMany({
      where: {
        releaseId: release.id,
        territoryName: { contains: cadastralArea.trim(), mode: "insensitive" },
      },
      select: {
        territoryCode: true,
        territoryName: true,
        municipalityName: true,
      },
    });
    const selected = selectMfTerritoryFromPropertyData({
      cadastralArea,
      city: property?.city,
      candidates,
    });
    if (selected) {
      mapping = { propertyId: args.propertyId, ...selected };
      locationSource = "PROPERTY_CADASTRAL_DATA";
    }
  }

  if (!mapping)
    return {
      mapping: null,
      locationSource: null,
      cadastralArea: cadastralArea ?? null,
      release,
      vk1: null,
      vk2: null,
      vk3: null,
      vk4: null,
    };
  if (!release)
    return {
      mapping,
      locationSource,
      cadastralArea: cadastralArea ?? null,
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
    return { mapping, locationSource, cadastralArea: cadastralArea ?? null, release, vk1: null, vk2: null, vk3: null, vk4: null };
  const data = mfRentTerritoryDataSchema.parse(snapshot.data);
  return {
    mapping,
    locationSource,
    cadastralArea: cadastralArea ?? null,
    release,
    vk1: data.vk1,
    vk2: data.vk2,
    vk3: data.vk3,
    vk4: data.vk4,
  };
}

export async function resolveLiveMfRentBenchmarks(args: {
  propertyIds: string[];
  targetYear: number;
  targetQuarter: number;
  cutoff: Date;
}) {
  const release = await resolveMfRentRelease(args);
  if (!release || args.propertyIds.length === 0) return { release, properties: [] };
  const [mappings, properties] = await Promise.all([
    prisma.propertyMfRentLocation.findMany({
      where: { propertyId: { in: args.propertyIds } },
    }),
    prisma.property.findMany({
      where: { id: { in: args.propertyIds } },
      select: { id: true, city: true, technicalData: true },
    }),
  ]);
  const explicitByProperty = new Map(mappings.map((row) => [row.propertyId, row]));
  const unresolvedProperties = properties.flatMap((property) => {
    if (explicitByProperty.has(property.id)) return [];
    const cadastralArea = readPropertyTechnicalData(property.technicalData).cadastralArea?.trim();
    return cadastralArea ? [{ ...property, cadastralArea }] : [];
  });
  const cadastralCandidates = unresolvedProperties.length
    ? await prisma.mfRentTerritorySnapshot.findMany({
        where: {
          releaseId: release.id,
          OR: unresolvedProperties.map((property) => ({
            territoryName: { contains: property.cadastralArea, mode: "insensitive" as const },
          })),
        },
        select: {
          territoryCode: true,
          territoryName: true,
          municipalityName: true,
        },
      })
    : [];
  type ResolvedMapping = {
    propertyId: string;
    territoryCode: string;
    territoryName: string;
    municipalityName: string | null;
    locationSource: "EXPLICIT" | "PROPERTY_CADASTRAL_DATA";
  };
  const resolvedMappings = properties.map((property): ResolvedMapping | null => {
    const explicit = explicitByProperty.get(property.id);
    if (explicit)
      return {
        propertyId: explicit.propertyId,
        territoryCode: explicit.territoryCode,
        territoryName: explicit.territoryName,
        municipalityName: explicit.municipalityName,
        locationSource: "EXPLICIT",
      };
    const cadastralArea = readPropertyTechnicalData(property.technicalData).cadastralArea;
    const selected = selectMfTerritoryFromPropertyData({
      cadastralArea,
      city: property.city,
      candidates: cadastralCandidates,
    });
    return selected
      ? { propertyId: property.id, ...selected, locationSource: "PROPERTY_CADASTRAL_DATA" }
      : null;
  }).filter((mapping): mapping is ResolvedMapping => mapping !== null);
  const snapshots = await prisma.mfRentTerritorySnapshot.findMany({
    where: {
      releaseId: release.id,
      territoryCode: { in: [...new Set(resolvedMappings.map((row) => row.territoryCode))] },
    },
  });
  const byTerritory = new Map(snapshots.map((row) => [row.territoryCode, row]));
  return {
    release,
    properties: resolvedMappings.flatMap((mapping) => {
      const snapshot = byTerritory.get(mapping.territoryCode);
      if (!snapshot) return [];
      const parsed = mfRentTerritoryDataSchema.safeParse(snapshot.data);
      if (!parsed.success) return [];
      return [{
        propertyId: mapping.propertyId,
        territoryCode: mapping.territoryCode,
        territoryName: mapping.territoryName,
        locationSource: mapping.locationSource,
        data: parsed.data,
      }];
    }),
  };
}
