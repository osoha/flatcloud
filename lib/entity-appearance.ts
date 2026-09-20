import { cache } from "react";
import { prisma } from "@/lib/db";
import { appearanceColors, type AppearanceColor } from "@/lib/entity-appearance-values";

export const loadEntityAppearances = cache(async (userId: string) => {
  const rows = await prisma.userEntityAppearance.findMany({ where: { userId }, select: { entityKey: true, favorite: true, photoId: true, color: true, avatarMimeType: true, updatedAt: true } });
  return Object.fromEntries(rows.map(row => [row.entityKey, { favorite: row.favorite, avatarMimeType: row.avatarMimeType, updatedAt: row.updatedAt, photoId: row.photoId, color: row.color && Object.hasOwn(appearanceColors, row.color) ? row.color as AppearanceColor : "" }]));
});
