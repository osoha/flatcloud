import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { serializableTransaction } from "../serializable";
import { calculatePropertySnapshot } from "./snapshot-calculator";
import { canonicalSnapshotPeriod, nextSnapshotRevision, validateSnapshotPeriod } from "./invariants";
import { quarterSnapshotDataSchema, quarterSnapshotQualitySchema } from "./snapshot-schema";
export const SNAPSHOT_CALCULATOR_VERSION = "v1";
const REVISION_RETRIES = 3;
export async function calculateAndStoreSnapshot(input: { propertyId: string; asOf: Date; createdById?: string }) {
  const canonical = canonicalSnapshotPeriod(input.asOf);
  const units = await prisma.unit.findMany({ where: { propertyId: input.propertyId }, include: { operationalStatusEvents: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] }, leases: { include: { paymentItems: true, charges: { include: { items: true, allocations: { include: { transaction: true } }, securityDepositOffsets: true, creditApplications: true } }, securityDepositTerms: true, securityDepositMovements: true } } } });
  const result = calculatePropertySnapshot({ propertyId: input.propertyId, asOf: canonical.asOfDate, units }); quarterSnapshotDataSchema.parse(result.data); quarterSnapshotQualitySchema.parse(result.quality);
  for (let attempt = 0; ; attempt += 1) { try { return await serializableTransaction(async (tx) => { const latest = await tx.quarterSnapshot.findFirst({ where: { propertyId: input.propertyId, asOfDate: canonical.asOfDate }, orderBy: { revision: "desc" }, select: { revision: true } }); const revision = nextSnapshotRevision(latest?.revision); validateSnapshotPeriod({ asOfDate: canonical.asOfDate, year: canonical.year, quarter: canonical.quarter, revision }); return tx.quarterSnapshot.create({ data: { propertyId: input.propertyId, asOfDate: canonical.asOfDate, year: canonical.year, quarter: canonical.quarter, revision, source: "CALCULATED", schemaVersion: 1, calculatorVersion: SNAPSHOT_CALCULATOR_VERSION, data: result.data, quality: result.quality, createdById: input.createdById } }); }); } catch (error) { const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; if (!collision || attempt >= REVISION_RETRIES) throw error; } }
}
