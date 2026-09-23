import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { taskAccessWhere } from "@/lib/access";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, ...taskAccessWhere(user) }, select: { id: true } });
  if (!task) return new Response(null, { status: 404 });
  await prisma.taskUserState.upsert({ where: { taskId_userId: { taskId: id, userId: user.id } }, create: { taskId: id, userId: user.id, lastReadAt: new Date() }, update: { lastReadAt: new Date() } });
  return new Response(null, { status: 204 });
}
