import { cache } from "react";
import { prisma } from "@/lib/db";
import { appearanceColors, type AppearanceColor } from "@/lib/entity-appearance-values";

export const loadEntityAppearances = cache(async (userId: string) => {
  const rows = await prisma.userEntityAppearance.findMany({ where: { userId } });
  return Object.fromEntries(rows.map(row => [row.entityKey, { favorite: row.favorite, photoId: row.photoId, color: row.color && Object.hasOwn(appearanceColors, row.color) ? row.color as AppearanceColor : "" }]));
});
