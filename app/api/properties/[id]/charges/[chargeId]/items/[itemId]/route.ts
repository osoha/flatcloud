import { ChargeCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { paidCents } from "@/lib/charges";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; chargeId: string; itemId: string }> }) {
  const { id, chargeId, itemId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  const redirectTo = `/nemovitosti/${id}/predpisy/mesicni/${chargeId}`;
  try {
    const item = await prisma.chargeItem.findFirst({
      where: { id: itemId, chargeId, charge: { lease: { unit: { propertyId: id } } } },
      include: { charge: { include: { items: true, allocations: true, securityDepositOffsets: true, creditApplications: true } } },
    });
    if (!item) throw new Error("PoloÅ¾ka mÄ›sÃ­ÄnÃ­ho pÅ™edpisu nebyla nalezena.");
    const form = await request.formData();
    const mode = text(form, "mode") || "save";
    const paid = paidCents(item.charge);
    if (paid > 0) throw new Error("UhrazenÃ½ nebo ÄÃ¡steÄnÄ› uhrazenÃ½ pÅ™edpis nelze bÄ›Å¾nÄ› pÅ™episovat. PouÅ¾ijte auditovanou opravu platby nebo novÃ½ korekÄnÃ­ pÅ™edpis.");

    let total: number;
    let amountCents = item.amountCents;
    let name = item.name;
    let category = item.category;
    if (mode === "delete") {
      total = item.charge.items.filter((row) => row.id !== itemId).reduce((sum, row) => sum + row.amountCents, 0);
    } else {
      name = text(form, "name", true)!;
      category = (text(form, "category") || "OTHER") as ChargeCategory;
      amountCents = moneyToCents(form, "amount");
      total = item.charge.items.reduce((sum, row) => sum + (row.id === itemId ? amountCents : row.amountCents), 0);
    }
    if (total < 0) throw new Error("CelkovÃ½ mÄ›sÃ­ÄnÃ­ pÅ™edpis nesmÃ­ bÃ½t zÃ¡pornÃ½.");
    if (total < paid) throw new Error("PÅ™edpis nelze snÃ­Å¾it pod jiÅ¾ uhrazenou ÄÃ¡stku.");

    await prisma.$transaction(async (tx) => {
      if (mode === "delete") await tx.chargeItem.delete({ where: { id: itemId } });
      else await tx.chargeItem.update({ where: { id: itemId }, data: { name, category, amountCents } });
      await tx.charge.update({ where: { id: chargeId }, data: { amountCents: total, manualOverride: true } });
    });
    await audit(access.user.id, mode === "delete" ? "CHARGE_ITEM_REMOVED" : "CHARGE_ITEM_UPDATED", "ChargeItem", itemId, { propertyId: id, chargeId, total }, id);
    return goWithMessage(request, redirectTo, "ok", mode === "delete" ? "PoloÅ¾ka byla odstranÄ›na." : "PoloÅ¾ka byla upravena.");
  } catch (error) {
    return goWithMessage(request, redirectTo, "error", error instanceof Error ? error.message : "PoloÅ¾ku se nepodaÅ™ilo upravit.");
  }
}
×M:ãí¯s‡ıkW÷ñÍ|åşùM|éö÷óMûy§úw­¦ŸÚ¦/é®Š^®Ø³øıÈZ®¬ıÈZ®ˆwø­zk?Š×¦!ßë¢ë^¶