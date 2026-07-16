import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { periodDueDate, periodStart } from "@/lib/period";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const period = text(form, "period", true)!;
    const start = periodStart(period);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth()+1, 0, 23, 59, 59));
    const lease = await prisma.lease.findFirst({ where: { unitId, unit: { propertyId: id }, status: { in: ["ACTIVE","FUTURE"] }, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] }, include: { paymentItems: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } });
    if (!lease) throw new Error("Pro zvolené období není u jednotky aktivní smlouva.");
    const items = lease.paymentItems.filter((item)=>item.validFrom<=end&&(!item.validTo||item.validTo>=start));
    if (!items.length) throw new Error("Smlouva nemá pro toto období aktivní položky předpisu.");
    const exists = await prisma.charge.findUnique({ where: { leaseId_period: { leaseId: lease.id, period } } });
    if (exists) return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "error", "Předpis pro tento měsíc již existuje.");
    const charge = await prisma.charge.create({ data: { leaseId: lease.id, period, dueDate: periodDueDate(period, lease.dueDay, lease.rentTiming), amountCents: items.reduce((s,i)=>s+i.amountCents,0), items: { create: items.map(i=>({ name:i.name, category:i.category, amountCents:i.amountCents })) } } });
    await audit(access.user.id,"UNIT_CHARGE_GENERATED","Charge",charge.id,{unitId,period});
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "ok", `Předpis ${period} byl vytvořen.`);
  } catch(error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "error", error instanceof Error?error.message:"Předpis se nepodařilo vytvořit.");
  }
}
