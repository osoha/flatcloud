import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { audit, hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

const kinds = new Set(["COMMENT", "CALL", "EMAIL", "PROMISE", "STATUS", "SYSTEM"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, propertyId: true, leaseId: true } });
  if (!task) return goWithMessage(request, "/ukoly", "error", "Úkol nebyl nalezen.");
  if (!(await hasPropertyPermission(user, task.propertyId, "EDIT"))) return goWithMessage(request, `/ukoly/${id}`, "error", "Nemáte oprávnění přidávat záznamy.");
  try {
    const form = await request.formData();
    const body = text(form, "body", true)!;
    const kindRaw = text(form, "kind") || "COMMENT";
    if (!kinds.has(kindRaw)) throw new Error("Neplatný typ záznamu.");

    const promiseDateRaw = kindRaw === "PROMISE" ? text(form, "promiseDate") : null;
    const promiseAmountRaw = kindRaw === "PROMISE" ? text(form, "promiseAmount") : null;
    const promiseDate = promiseDateRaw ? new Date(`${promiseDateRaw}T12:00:00`) : null;
    const promiseAmountCents = promiseAmountRaw ? Math.round(Number(promiseAmountRaw.replace(",", ".")) * 100) : null;
    if (promiseDate && Number.isNaN(promiseDate.getTime())) throw new Error("Neplatné datum příslibu.");
    if (promiseAmountRaw && (!promiseAmountCents || promiseAmountCents <= 0)) throw new Error("Přislíbená částka musí být vyšší než 0 Kč.");

    const entry = await prisma.taskEntry.create({
      data: {
        taskId: id,
        authorId: user.id,
        kind: kindRaw as "COMMENT" | "CALL" | "EMAIL" | "PROMISE" | "STATUS" | "SYSTEM",
        body,
        promisedPaymentDate: kindRaw === "PROMISE" ? promiseDate : null,
        promisedAmountCents: kindRaw === "PROMISE" ? promiseAmountCents : null,
      },
    });
    if (kindRaw === "PROMISE") {
      await prisma.task.update({ where: { id }, data: { status: "WAITING", ...(promiseDate ? { dueAt: promiseDate } : {}) } });
      if (task.leaseId) await prisma.lease.update({ where: { id: task.leaseId }, data: { promisedPaymentDate: promiseDate, promisedAmountCents: promiseAmountCents && promiseAmountCents > 0 ? promiseAmountCents : null, collectionNote: body } });
    }
    await audit(user.id, "TASK_ENTRY_ADDED", "TaskEntry", entry.id, { taskId: id, kind: kindRaw, promiseDate: promiseDate?.toISOString(), promiseAmountCents }, task.propertyId);
    return goWithMessage(request, `/ukoly/${id}`, "ok", "Záznam byl přidán do vlákna.");
  } catch (error) {
    return goWithMessage(request, `/ukoly/${id}`, "error", error instanceof Error ? error.message : "Záznam se nepodařilo přidat.");
  }
}
