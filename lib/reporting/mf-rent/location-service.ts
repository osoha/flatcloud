import { prisma } from "@/lib/db";
import { hasAllPropertyAccess } from "@/lib/auth";
type Actor = { id: string; role: string; allProperties?: boolean };
export async function canWriteMfRentLocation(actor: Actor, propertyId: string) {
  if (hasAllPropertyAccess(actor)) return true;
  const [whole, unit] = await Promise.all([
    prisma.userProperty.findUnique({
      where: { userId_propertyId: { userId: actor.id, propertyId } },
    }),
    prisma.userUnit.count({
      where: { userId: actor.id, unit: { propertyId } },
    }),
  ]);
  return (
    unit === 0 && Boolean(whole && ["EDIT", "ADMIN"].includes(whole.permission))
  );
}
export async function searchMfRentTerritories(
  query: string,
  city?: string,
  limit = 25,
) {
  const q = query.trim();
  if (q.length < 2) return [];
  const terms = q.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (terms.length === 0) return [];
  const take = Math.min(Math.max(limit, 1), 30);
  const rows = await prisma.mfRentTerritorySnapshot.findMany({
    where: {
      release: {
        id:
          (
            await prisma.mfRentDatasetRelease.findFirst({
              orderBy: [
                { marketYear: "desc" },
                { marketQuarter: "desc" },
                { publishedOn: "desc" },
              ],
            })
          )?.id ?? "",
      },
      AND: terms.map((term) => ({
        OR: [
          { territoryName: { contains: term, mode: "insensitive" as const } },
          { municipalityName: { contains: term, mode: "insensitive" as const } },
          { territoryCode: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    distinct: ["territoryCode"],
    take: take * 2,
  });
  return rows
    .sort(
      (a, b) =>
        Number(
          (b.municipalityName || "").toLowerCase() ===
            (city || "").toLowerCase(),
        ) -
        Number(
          (a.municipalityName || "").toLowerCase() ===
            (city || "").toLowerCase(),
        ),
    )
    .slice(0, take);
}
export async function assignPropertyMfRentLocation(
  actor: Actor,
  propertyId: string,
  territoryCode: string,
) {
  if (!(await canWriteMfRentLocation(actor, propertyId)))
    throw new Error("Nemáte oprávnění změnit přiřazení MF.");
  const territory = await prisma.mfRentTerritorySnapshot.findFirst({
    where: { territoryCode },
    orderBy: { release: { publishedOn: "desc" } },
  });
  if (!territory) throw new Error("Neplatné území MF.");
  return prisma.$transaction(async (tx) => {
    const old = await tx.propertyMfRentLocation.findUnique({
      where: { propertyId },
    });
    const mapping = await tx.propertyMfRentLocation.upsert({
      where: { propertyId },
      create: {
        propertyId,
        territoryCode,
        territoryName: territory.territoryName,
        municipalityName: territory.municipalityName,
        confirmedById: actor.id,
      },
      update: {
        territoryCode,
        territoryName: territory.territoryName,
        municipalityName: territory.municipalityName,
        confirmedById: actor.id,
        confirmedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        propertyId,
        action: "MF_RENT_LOCATION_ASSIGNED",
        entityType: "PropertyMfRentLocation",
        entityId: propertyId,
        details: {
          oldTerritoryCode: old?.territoryCode ?? null,
          newTerritoryCode: territoryCode,
          newTerritoryName: territory.territoryName,
        },
      },
    });
    return mapping;
  });
}
