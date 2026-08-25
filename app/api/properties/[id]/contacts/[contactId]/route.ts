import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { boolValue, intValue, text } from "@/lib/forms";
import { audit, hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
const categories = new Set(["MANAGER", "EMERGENCY", "ELECTRICIAN", "PLUMBER", "HEATING", "ELEVATOR", "FIRE_SAFETY", "INSPECTION", "INSURANCE", "CLEANING", "UTILITY", "OTHER"]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const user = await currentUser(); if (!user) return go(request, "/login"); const { id, contactId } = await params;
  if (!(await hasPropertyPermission(user, id, "EDIT"))) return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", "Nemáte oprávnění upravovat kontakty.");
  try { const form = await request.formData(); const mode = text(form, "mode");
    if (mode === "delete") { await prisma.propertyContact.update({ where: { id: contactId }, data: { active: false } }); await audit(user.id, "PROPERTY_CONTACT_DISABLED", "PropertyContact", contactId, {}, id); return goWithMessage(request, `/nemovitosti/${id}/provoz`, "ok", "Kontakt byl deaktivován."); }
    const category = text(form, "category") || "OTHER"; if (!categories.has(category)) throw new Error("Neplatná kategorie kontaktu.");
    await prisma.propertyContact.update({ where: { id: contactId }, data: { category: category as any, name: text(form, "name", true)!, company: text(form, "company"), phone: text(form, "phone"), email: text(form, "email"), note: text(form, "note"), emergency: boolValue(form, "emergency"), sortOrder: intValue(form, "sortOrder", 100) } });
    await audit(user.id, "PROPERTY_CONTACT_UPDATED", "PropertyContact", contactId, { category }, id); return goWithMessage(request, `/nemovitosti/${id}/provoz`, "ok", "Kontakt byl uložen.");
  } catch(error){ return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", error instanceof Error ? error.message : "Kontakt se nepodařilo uložit."); }
}
