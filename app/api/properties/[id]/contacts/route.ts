import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { boolValue, intValue, text } from "@/lib/forms";
import { audit, hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

const categories = new Set(["MANAGER", "EMERGENCY", "ELECTRICIAN", "PLUMBER", "HEATING", "ELEVATOR", "FIRE_SAFETY", "INSPECTION", "INSURANCE", "CLEANING", "UTILITY", "OTHER"]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return go(request, "/login");
  const { id } = await params;
  if (!(await hasPropertyPermission(user, id, "EDIT"))) return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", "Nemáte oprávnění upravovat kontakty.");
  try {
    const form = await request.formData(); const category = text(form, "category") || "OTHER"; if (!categories.has(category)) throw new Error("Neplatná kategorie kontaktu.");
    const created = await prisma.propertyContact.create({ data: { propertyId: id, category: category as any, name: text(form, "name", true)!, company: text(form, "company"), phone: text(form, "phone"), email: text(form, "email"), note: text(form, "note"), emergency: boolValue(form, "emergency"), active: true, sortOrder: intValue(form, "sortOrder", 100) } });
    await audit(user.id, "PROPERTY_CONTACT_CREATED", "PropertyContact", created.id, { name: created.name, category }, id);
    return goWithMessage(request, `/nemovitosti/${id}/provoz`, "ok", "Důležitý kontakt byl přidán.");
  } catch (error) { return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", error instanceof Error ? error.message : "Kontakt se nepodařilo přidat."); }
}
