import { loadEntityAppearances } from "@/lib/entity-appearance";
import { entityAppearanceKey } from "@/lib/entity-appearance-values";
import { prisma } from "@/lib/db";
import { documentAccessWhere } from "@/lib/documents/access";

type User = Parameters<typeof documentAccessWhere>[0];
export type EntityPhotos = { properties: Record<string, string>; units: Record<string, string> };

/** Batch lookup through existing document permissions. Never expose storage URLs.
 * Display only the explicit personal choice; absent choices use a generic icon.
 * Property avatars cannot accidentally borrow another unit's photo or a task attachment.
 */
export async function loadEntityPhotoCandidates(user: User, propertyIds: string[]) {
  if (!propertyIds.length) return [];
  const documents = await prisma.document.findMany({
    where: { AND: [documentAccessWhere(user), {
      propertyId: { in: propertyIds }, category: "PHOTO", leaseId: null,
      taskId: null, taskEntryId: null, complianceRecordId: null, propertyCostId: null,
      fileAsset: { deletedAt: null, mimeType: { startsWith: "image/" } },
    }] },
    select: { id: true, title: true, propertyId: true, unitId: true,
      quarterlyPropertyReportMedia: { where: { role: "PRIMARY" }, select: { id: true }, take: 1 } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  // Stable sort preserves first-upload order within the primary/non-primary groups.
  documents.sort((a, b) => Number(b.quarterlyPropertyReportMedia.length > 0) - Number(a.quarterlyPropertyReportMedia.length > 0));
  return documents;
}

export async function loadEntityPhotos(user: User, propertyIds: string[]): Promise<EntityPhotos> {
  const [documents, preferences] = await Promise.all([loadEntityPhotoCandidates(user, propertyIds), loadEntityAppearances(user.id)]);
  const result: EntityPhotos = { properties: {}, units: {} };
  for (const document of documents) {
    const map = document.unitId ? result.units : result.properties;
    const key = document.unitId || document.propertyId;
    const preferred = preferences[entityAppearanceKey(document.propertyId, document.unitId)]?.photoId;
    if (preferred === document.id) map[key] = document.id;
  }
  for (const [key, preference] of Object.entries(preferences)) {
    if (preference.photoId === "icon") {
      const [kind, id] = key.split(":");
      if (kind === "property" && !propertyIds.includes(id)) continue;
      (kind === "unit" ? result.units : result.properties)[id] = "icon";
    }
    if (preference.photoId?.startsWith("library:")) {
      const [kind, id] = key.split(":");
      if (kind === "property" && !propertyIds.includes(id)) continue;
      (kind === "unit" ? result.units : result.properties)[id] = preference.photoId;
    }
    if (preference.photoId !== "upload" || !preference.avatarMimeType) continue;
    const [kind, id] = key.split(":");
    if (kind === "property" && !propertyIds.includes(id)) continue;
    // Image endpoint rechecks effective user and entity access on every request.
    (kind === "unit" ? result.units : result.properties)[id] = `avatar:${key}:${preference.updatedAt.getTime()}`;
  }
  return result;
}
