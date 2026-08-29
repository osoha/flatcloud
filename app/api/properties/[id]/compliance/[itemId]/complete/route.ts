import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateValue, text } from "@/lib/forms";
import { audit, hasPropertyPermission } from "@/lib/management";
import { addMonthsKeepingDay } from "@/lib/operations";
import { go, goWithMessage } from "@/lib/route-response";
import { prepareDocumentFiles,documentCategory } from "@/lib/documents/upload";
import { createDocumentFromUpload } from "@/lib/documents/service";
import { DocumentCategory } from "@prisma/client";
const results = new Set(["OK", "ISSUE", "FOLLOW_UP"]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await currentUser(); if (!user) return go(request, "/login"); const { id, itemId } = await params;
  if (!(await hasPropertyPermission(user, id, "EDIT"))) return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", "Nemáte oprávnění uzavírat revize.");
  try { const item = await prisma.complianceItem.findFirst({ where: { id: itemId, propertyId: id } }); if (!item) throw new Error("Revize nebyla nalezena.");
    const form = await request.formData(); const hasFiles=form.getAll("files").some(value=>value instanceof File&&value.size>0);const files=hasFiles?await prepareDocumentFiles(form):[];const performedAt = dateValue(form, "performedAt", true)!; const result = text(form, "result") || "OK"; if (!results.has(result)) throw new Error("Neplatný výsledek kontroly.");
    const explicitNext = dateValue(form, "nextDueAt"); const nextDueAt = explicitNext || (item.frequencyMonths ? addMonthsKeepingDay(performedAt, item.frequencyMonths) : item.nextDueAt);
    const record=await prisma.$transaction(async tx=>{const created=await tx.complianceRecord.create({ data: { complianceItemId: item.id, performedAt, result: result as any, note: text(form, "note"), performedBy: text(form, "performedBy"), nextDueAt, createdById: user.id } });await tx.complianceItem.update({ where: { id: item.id }, data: { lastCompletedAt: performedAt, nextDueAt } });return created});
    for(const file of files)await createDocumentFromUpload({actor:user,propertyId:id,complianceRecordId:record.id,...file,category:documentCategory(null,file,DocumentCategory.INSPECTION_PROTOCOL),title:file.originalName,documentDate:performedAt});
    await audit(user.id, "COMPLIANCE_COMPLETED", "ComplianceItem", item.id, { result, performedAt: performedAt.toISOString(), nextDueAt: nextDueAt.toISOString() }, id); return goWithMessage(request, `/nemovitosti/${id}/provoz`, "ok", "Kontrola byla zaznamenána a další termín aktualizován.");
  } catch(error){ return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", error instanceof Error ? error.message : "Kontrolu se nepodařilo uložit."); }
}
