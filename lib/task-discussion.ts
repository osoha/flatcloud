import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { taskViewWhere, taskEditWhere, taskEntryVisibilityWhere } from "./task-access";
import type { DiscussionPerson } from "./task-discussion-shared";
export type DiscussionClient = Prisma.TransactionClient | typeof prisma;

export async function discussionParticipants(taskId: string, client: DiscussionClient = prisma): Promise<DiscussionPerson[]> {
  const task = await client.task.findUnique({ where: { id: taskId }, select: { createdById: true, assigneeId: true, members: { select: { userId: true } } } });
  if (!task) return [];
  const ids = [...new Set([task.createdById, task.assigneeId, ...task.members.map(m => m.userId)].filter((id): id is string => Boolean(id)))];
  const people = await client.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true, email: true, role: true, allProperties: true } });
  const result: DiscussionPerson[] = [];
  for (const person of people) {
    if (!await client.task.count({ where: { AND: [{ id: taskId }, taskViewWhere(person)] } })) continue;
    const internal = Boolean(await client.task.count({ where: { AND: [{ id: taskId }, { OR: [taskEditWhere(person), { members: { some: { userId: person.id } } }] }] } }));
    result.push({ id: person.id, name: person.name, email: person.email, internal });
  }
  return result.sort((a,b) => a.name.localeCompare(b.name, "cs"));
}

export async function visibleTaskEntry(user: { id: string; role: string; allProperties?: boolean }, taskId: string, entryId: string, client: DiscussionClient = prisma) {
  return client.taskEntry.findFirst({ where: { AND: [{ id: entryId, taskId, task: taskViewWhere(user) }, taskEntryVisibilityWhere(user)] } });
}
