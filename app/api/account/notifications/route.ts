import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notificationFields } from "@/lib/task-discussion-shared";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const form = await request.formData();
  const data = Object.fromEntries(notificationFields.map(([key]) => [key, form.get(key) === "on"]));
  await prisma.taskNotificationPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  return goWithMessage(request, "/ucet#upozorneni", "ok", "Nastavení upozornění bylo uloženo.");
}
