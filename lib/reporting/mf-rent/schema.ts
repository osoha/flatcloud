import { z } from "zod";

const cents = z.number().int().nullable();
export const mfRentCategorySchema = z.object({
  referenceRentCentsPerM2: cents,
  lowerIntervalCentsPerM2: cents,
  upperIntervalCentsPerM2: cents,
  newBuildReferenceRentCentsPerM2: cents,
  minimumCentsPerM2: cents,
  maximumCentsPerM2: cents,
  medianCentsPerM2: cents,
  dataCoverage: z.number().int().nullable(),
});
export const mfRentTerritoryDataSchema = z.object({
  schemaVersion: z.literal(1),
  vk1: mfRentCategorySchema,
  vk2: mfRentCategorySchema,
  vk3: mfRentCategorySchema,
  vk4: mfRentCategorySchema,
});
export type MfRentTerritoryData = z.infer<typeof mfRentTerritoryDataSchema>;
