import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { visibleTaskEntry } from "@/lib/task-discussion";
import { taskReactions } from "@/lib/task-discussion-shared";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Přihlaste se." }, { status: 401 });
  const { id, entryId } = await params;
  if (!await visibleTaskEntry(user, id, entryId)) return Response.json({ error: "Záznam není dostupný." }, { status: 404 });
  const form = await request.formData();
  const reaction = String(form.get("reaction") || "");
  if (reaction && !taskReactions.some(item => item.key === reaction)) return Response.json({ error: "Neplatná reakce." }, { status: 400 });
  if (reaction) await prisma.taskEntryReaction.upsert({ where: { entryId_userId: { entryId, userId: user.id } }, create: { entryId, userId: user.id, reaction }, update: { reaction } });
  else await prisma.taskEntryReaction.deleteMany({ where: { entryId, userId: user.id } });
  // Deliberately do not touch Task.updatedAt, read markers or notification queues.
  return Response.json({ ok: true });
}
