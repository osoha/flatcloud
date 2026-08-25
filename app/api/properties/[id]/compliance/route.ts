import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateValue, intValue, text } from "@/lib/forms";
import { audit, hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return go(request, "/login"); const { id } = await params;
  if (!(await hasPropertyPermission(user, id, "EDIT"))) return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", "Nemáte oprávnění přidávat revize.");
  try { const form = await request.formData(); const nextDueAt = dateValue(form, "nextDueAt", true)!; const frequencyMonths = intValue(form, "frequencyMonths", 0);
    const created = await prisma.complianceItem.create({ data: { propertyId: id, name: text(form, "name", true)!, category: text(form, "category", true)!, nextDueAt, frequencyMonths: frequencyMonths > 0 ? frequencyMonths : null, assignedContactId: text(form, "assignedContactId"), note: text(form, "note") } });
    await audit(user.id, "COMPLIANCE_ITEM_CREATED", "ComplianceItem", created.id, { name: created.name, nextDueAt: nextDueAt.toISOString() }, id); return goWithMessage(request, `/nemovitosti/${id}/provoz`, "ok", "Revize / kontrola byla přidána.");
  } catch(error){ return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", error instanceof Error ? error.message : "Revizi se nepodařilo přidat."); }
}
