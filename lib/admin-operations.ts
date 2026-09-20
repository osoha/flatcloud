import { prisma } from "@/lib/db";
import { ONLINE_WINDOW_MS } from "@/lib/user-activity-policy";

export async function loadAdminOperations() {
  const now = new Date();
  const [online, invitations, inboxErrors] = await Promise.all([
    prisma.userActivity.count({ where: { user: { active: true }, lastSeenAt: { gt: new Date(now.getTime() - ONLINE_WINDOW_MS), lte: now } } }),
    prisma.userInvitation.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    prisma.inboxPayment.count({ where: { status: "ERROR" } }),
  ]);
  return { online, invitations, inboxErrors, asOf: now.toISOString() };
}
