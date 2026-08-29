import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateValue, text } from "@/lib/forms";
import { hasPropertyPermission } from "@/lib/management";
import { addMonthsKeepingDay } from "@/lib/operations";
import { go, goWithMessage } from "@/lib/route-response";
import { prepareDocumentFiles,documentCategory } from "@/lib/documents/upload";
import { DocumentCategory } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { cleanupStoredDocumentBatch, createStoredDocumentsInTransaction, prepareDocumentBatch, storePreparedDocumentBatch } from "@/lib/documents/batch-service";
const results = new Set(["OK", "ISSUE", "FOLLOW_UP"]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await currentUser(); if (!user) return go(request, "/login"); const { id, itemId } = await params;
  if (!(await hasPropertyPermission(user, id, "EDIT"))) return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", "Nemáte oprávnění uzavírat revize.");
  try { const item = await prisma.complianceItem.findFirst({ where: { id: itemId, propertyId: id } }); if (!item) throw new Error("Revize nebyla nalezena.");
    const form = await request.formData(); const hasFiles=form.getAll("files").some(value=>value instanceof File&&value.size>0);const files=hasFiles?await prepareDocumentFiles(form):[];const performedAt = dateValue(form, "performedAt", true)!; const result = text(form, "result") || "OK"; if (!results.has(result)) throw new Error("Neplatný výsledek kontroly.");
    const explicitNext = dateValue(form, "nextDueAt"); const nextDueAt = explicitNext || (item.frequencyMonths ? addMonthsKeepingDay(performedAt, item.frequencyMonths) : item.nextDueAt);
    const recordId=randomUUID(),inputs=files.map(file=>({propertyId:id,complianceRecordId:recordId,...file,category:documentCategory(null,file,DocumentCategory.INSPECTION_PROTOCOL),title:file.originalName,documentDate:performedAt}));
    const scope={mode:"PROPERTY" as const,propertyId:id},stored=await storePreparedDocumentBatch(await prepareDocumentBatch(user,inputs,inputs.map(()=>scope)));
    try{await prisma.$transaction(async tx=>{await tx.complianceRecord.create({ data: { id:recordId,complianceItemId: item.id, performedAt, result: result as any, note: text(form, "note"), performedBy: text(form, "performedBy"), nextDueAt, createdById: user.id } });await tx.complianceItem.update({ where: { id: item.id }, data: { lastCompletedAt: performedAt, nextDueAt } });await createStoredDocumentsInTransaction(tx,stored);await tx.auditLog.create({data:{userId:user.id,propertyId:id,action:"COMPLIANCE_COMPLETED",entityType:"ComplianceItem",entityId:item.id,details:{result,performedAt:performedAt.toISOString(),nextDueAt:nextDueAt.toISOString()}}});});}catch(error){await cleanupStoredDocumentBatch(stored);throw error;}
    return goWithMessage(request, `/nemovitosti/${id}/provoz`, "ok", "Kontrola byla zaznamenána a další termín aktualizován.");
  } catch(error){ return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", error instanceof Error ? error.message : "Kontrolu se nepodařilo uložit."); }
}
