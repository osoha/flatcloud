import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { periodDueDate, periodStart } from "@/lib/period";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const period = text(form, "period", true)!;
    const start = periodStart(period);
    const leases = await prisma.lease.findMany({
      where: {
        unit: { propertyId: id },
        status: { in: ["ACTIVE", "FUTURE"] },
        startDate: { lte: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59)) },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
      include: { paymentItems: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    let created = 0;
    let skipped = 0;
    for (const lease of leases) {
      const items = lease.paymentItems.filter((item) => item.validFrom <= new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59)) && (!item.validTo || item.validTo >= start));
      if (!items.length) { skipped += 1; continue; }
      const exists = await prisma.charge.findUnique({ where: { leaseId_period: { leaseId: lease.id, period } }, select: { id: true } });
      if (exists) { skipped += 1; continue; }
      await prisma.charge.create({
        data: {
          leaseId: lease.id,
          period,
          dueDate: periodDueDate(period, lease.dueDay, lease.rentTiming),
          amountCents: items.reduce((sum, item) => sum + item.amountCents, 0),
          items: { create: items.map((item) => ({ name: item.name, category: item.category, amountCents: item.amountCents })) },
        },
      });
      created += 1;
    }
    await audit(access.user.id, "CHARGES_GENERATED", "Property", id, { period, created, skipped });
    return goWithMessage(request, `/nemovitosti/${id}/predpisy`, "ok", `Vytvořeno ${created} předpisů, přeskočeno ${skipped}.`);
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/predpisy`, "error", error instanceof Error ? error.message : "Předpisy se nepodařilo vytvořit.");
  }
}
