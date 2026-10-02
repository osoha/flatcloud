import { requireInboxBankAccess } from "@/lib/account-banking-access";
import { prisma } from "@/lib/db";
import { currentUser, hasAllPropertyAccess } from "@/lib/auth";
import { materializeInboxPayment } from "@/lib/inbound-bank/process";
import { audit } from "@/lib/management";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  try {
    const {row,accounts}=await requireInboxBankAccess(user,id);
    if (row.transactionId) throw new Error("Pohyb už byl předán do evidence.");
    const form = await request.formData();
    const propertyId = text(form, "propertyId", true)!;
    if(user.role!=="SUPER_ADMIN" && !accounts.some(a=>a.propertyLinks.some(link=>link.propertyId===propertyId))) throw new Error("Nemovitost není dostupná pro tento účet.");
    if(!hasAllPropertyAccess(user) && !await prisma.property.count({where:{id:propertyId,OR:[{memberships:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}}]}})) throw new Error("Nemáte oprávnění přiřadit výdaj k tomuto domu.");
    const result = await materializeInboxPayment(id, undefined, propertyId);
    if (!result.imported) throw new Error(result.reason || "Pohyb nelze předat do výdajů.");
    await audit(user.id, "INBOUND_EXPENSE_ASSIGNED", "InboxPayment", id, { propertyId, transactionId: result.transactionId }, propertyId);
    return goWithMessage(request, `/nemovitosti/${propertyId}/bankovni-vydaje`, "ok", "Odchozí pohyb byl předán do výdajů k posouzení. Náklad nevzniká bez přiřazení nebo pravidla.");
  } catch (error) {
    return goWithMessage(request, `/platby/nesparovane/email/${id}`, "error", error instanceof Error ? error.message : "Pohyb se nepodařilo předat.");
  }
}
