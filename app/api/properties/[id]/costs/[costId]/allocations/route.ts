import { prisma } from "@/lib/db";
import { requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";
import { allocateCostAmount, allocationBasisPoints, shareBasisPointsFromPercent, validateCustomShares, type AllocationShare, type CostAllocationMethod } from "@/lib/property-cost-allocations";

const methods = new Set<CostAllocationMethod>(["equal", "area", "custom"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string; costId: string }> }) {
  const { id, costId } = await params;
  const returnTo = `/nemovitosti/${id}/naklady/${costId}`;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, returnTo, "error", "Nemáte oprávnění měnit rozdělení nákladu.");
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") || "") as CostAllocationMethod | "clear";
    const result = await serializableTransaction(async (tx) => {
      const cost = await tx.propertyCost.findFirst({ where: { id: costId, propertyId: id }, include: { allocations: true } });
      if (!cost) throw new Error("Náklad nebyl nalezen.");
      const units = await tx.unit.findMany({ where: { propertyId: id }, select: { id: true, areaM2: true }, orderBy: { label: "asc" } });
      if (mode === "clear") {
        await tx.propertyCostAllocation.deleteMany({ where: { propertyCostId: cost.id } });
        await tx.propertyCost.update({ where: { id: cost.id }, data: { unitId: null } });
        await tx.auditLog.create({ data: { userId: access.user.id, propertyId: id, action: "PROPERTY_COST_ALLOCATION_CLEARED", entityType: "PropertyCost", entityId: cost.id, details: { previousAllocations: cost.allocations.map((row) => ({ unitId: row.unitId, shareBasisPoints: row.shareBasisPoints, amountCents: row.amountCents })) } } });
        return { count: 0 };
      }
      if (!methods.has(mode)) throw new Error("Vyberte platný způsob rozdělení nákladu.");
      let shares: AllocationShare[];
      if (mode === "custom") {
        shares = units.flatMap((unit) => {
          const raw = String(form.get(`share-${unit.id}`) || "").trim();
          return raw ? [{ unitId: unit.id, shareBasisPoints: shareBasisPointsFromPercent(raw) }] : [];
        });
        validateCustomShares(shares);
      } else {
        shares = allocationBasisPoints(mode, units);
      }
      const allocations = allocateCostAmount(cost.amountCents, shares);
      const singleUnitId = allocations.length === 1 ? allocations[0].unitId : null;
      await tx.propertyCostAllocation.deleteMany({ where: { propertyCostId: cost.id } });
      await tx.propertyCostAllocation.createMany({ data: allocations.map((row) => ({ ...row, propertyCostId: cost.id })) });
      await tx.propertyCost.update({ where: { id: cost.id }, data: { unitId: singleUnitId } });
      await tx.auditLog.create({ data: { userId: access.user.id, propertyId: id, action: "PROPERTY_COST_ALLOCATED", entityType: "PropertyCost", entityId: cost.id, details: { method: mode, previousAllocations: cost.allocations.map((row) => ({ unitId: row.unitId, shareBasisPoints: row.shareBasisPoints, amountCents: row.amountCents })), allocations } } });
      return { count: allocations.length };
    });
    const countLabel = result.count === 1 ? "1 jednotku" : result.count < 5 ? `${result.count} jednotky` : `${result.count} jednotek`;
    return goWithMessage(request, returnTo, "ok", result.count ? `Náklad byl rozdělen mezi ${countLabel}.` : "Náklad nyní patří celému objektu bez rozdělení na jednotky.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Rozdělení nákladu se nepodařilo uložit.");
  }
}
