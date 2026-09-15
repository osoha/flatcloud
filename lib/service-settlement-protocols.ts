import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { editableUnitWhere, leaseAccessWhere } from "./access";
import { businessDateKey } from "./calendar";
import { serializableTransaction } from "./serializable";
import { loadServiceSettlementPreviewTx } from "./service-settlement-preview";

type Actor = { id: string; role: string; allProperties?: boolean };
const protocolInclude = { issuedBy: { select: { id: true, name: true } }, charge: true, credit: true, lease: { include: { tenant: true, parties: { where: { role: "CONTRACTING_PARTY" }, include: { tenant: true }, orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] }, unit: { include: { property: true } } } } } satisfies Prisma.ServiceSettlementProtocolInclude;
export type ServiceSettlementSnapshot = {
  schemaVersion: 1 | 2;
  purpose?: "WORKING_PAPER";
  capturedAt?: string;
  blockers?: string[];
  period: { from: string; to: string };
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; label: string };
  lease: { id: string; contractNumber: string | null; tenantNames: string[] };
  totals: { advancesCents: number; actualCostsCents: number; balanceCents: number };
  advances: Array<{ period: string; amountCents: number }>;
  costs: Array<{ sourceCostId: string; title: string; effectiveAt: string; sourceAmountCents: number; allocatedAmountCents: number; allocationLabel: string; documentCount: number }>;
  meters: Array<{ label: string; unitOfMeasure: string; opening: { date: string; value: number } | null; closing: { date: string; value: number } | null; consumption: number | null }>;
  warnings: string[];
};

export function parseServiceSettlementSnapshot(value: Prisma.JsonValue): ServiceSettlementSnapshot {
  const snapshot = value as unknown as ServiceSettlementSnapshot;
  if (!snapshot || ![1, 2].includes(snapshot.schemaVersion) || !snapshot.period?.from || !snapshot.period?.to || !Array.isArray(snapshot.advances) || !Array.isArray(snapshot.costs) || !Array.isArray(snapshot.meters)) throw new Error("Uložený protokol má neplatný formát.");
  return snapshot;
}

export async function listServiceSettlementProtocols(actor: Actor, leaseId: string) {
  if (!await prisma.lease.findFirst({ where: { id: leaseId, ...leaseAccessWhere(actor) }, select: { id: true } })) throw new Error("Smlouva nebyla nalezena nebo k ní nemáte přístup.");
  return prisma.serviceSettlementProtocol.findMany({ where: { leaseId }, include: protocolInclude, orderBy: { issuedAt: "desc" } });
}

export async function loadServiceSettlementProtocol(actor: Actor, leaseId: string, protocolId: string) {
  const protocol = await prisma.serviceSettlementProtocol.findFirst({ where: { id: protocolId, leaseId, lease: leaseAccessWhere(actor) }, include: protocolInclude });
  if (!protocol) throw new Error("Protokol nebyl nalezen nebo k němu nemáte přístup.");
  return protocol;
}

export async function issueServiceSettlementProtocol(actor: Actor, leaseId: string, input: { from: string; to: string; dueDate?: Date | null; propertyId?: string }) {
  const now = new Date();
  try {
    return await serializableTransaction(async (tx) => {
      const preview = await loadServiceSettlementPreviewTx(tx, actor, leaseId, input.from, input.to, now);
      if (input.propertyId && input.propertyId !== preview.lease.unit.propertyId) throw new Error("Smlouva nepatří k této nemovitosti.");
      if (!await tx.unit.findFirst({ where: { id: preview.lease.unitId, ...editableUnitWhere(actor, preview.lease.unit.propertyId) }, select: { id: true } })) throw new Error("K vystavení protokolu potřebujete právo upravovat jednotku.");
      if (await tx.serviceSettlementProtocol.findFirst({ where: { leaseId, periodFrom: { lte: preview.period.toDate }, periodTo: { gte: preview.period.fromDate } }, select: { id: true } })) throw new Error("Pro tuto smlouvu už byl protokol vystaven v překrývajícím se období. Otevřete jeho historii.");
      const protocolId = crypto.randomUUID();
      const snapshot: Prisma.InputJsonValue = {
        schemaVersion: 2,
        purpose: "WORKING_PAPER",
        capturedAt: now.toISOString(),
        blockers: preview.blockers,
        period: { from: preview.period.from, to: preview.period.to },
        property: { id: preview.lease.unit.propertyId, name: preview.lease.unit.property.name, address: preview.lease.unit.property.address, city: preview.lease.unit.property.city },
        unit: { id: preview.lease.unitId, label: preview.lease.unit.label },
        lease: { id: preview.lease.id, contractNumber: preview.lease.contractNumber, tenantNames: preview.lease.parties.length ? preview.lease.parties.map((party) => party.tenant.name) : [preview.lease.tenant.name] },
        totals: { advancesCents: preview.advancesCents, actualCostsCents: preview.actualCostsCents, balanceCents: preview.balanceCents },
        advances: preview.advanceRows.map((row) => ({ period: row.period, amountCents: row.amountCents })),
        costs: preview.costRows.map((row) => ({ sourceCostId: row.id, title: row.title, effectiveAt: businessDateKey(row.effectiveAt), sourceAmountCents: row.sourceAmountCents, allocatedAmountCents: row.allocatedAmountCents, allocationLabel: row.allocationLabel, documentCount: row.documentCount })),
        meters: preview.meterRows.map((row) => ({ label: row.label, unitOfMeasure: row.unitOfMeasure, opening: row.opening ? { date: businessDateKey(row.opening.readAt), value: row.opening.value } : null, closing: row.closing ? { date: businessDateKey(row.closing.readAt), value: row.closing.value } : null, consumption: row.consumption })),
        warnings: preview.warnings,
      };
      const protocol = await tx.serviceSettlementProtocol.create({ data: { id: protocolId, leaseId, periodFrom: preview.period.fromDate, periodTo: preview.period.toDate, advancesCents: preview.advancesCents, actualCostsCents: preview.actualCostsCents, balanceCents: preview.balanceCents, dueDate: null, snapshot, issuedById: actor.id } });
      await tx.auditLog.create({ data: { userId: actor.id, propertyId: preview.lease.unit.propertyId, action: "SERVICE_SETTLEMENT_PROTOCOL_ISSUED", entityType: "ServiceSettlementProtocol", entityId: protocol.id, details: { leaseId, periodFrom: preview.period.from, periodTo: preview.period.to, advancesCents: preview.advancesCents, actualCostsCents: preview.actualCostsCents, balanceCents: preview.balanceCents, purpose: "WORKING_PAPER", chargeId: null, creditId: null } } });
      return protocol;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("Pro tuto smlouvu už byl protokol vystaven v překrývajícím se období. Otevřete jeho historii.");
    throw error;
  }
}
