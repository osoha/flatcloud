import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  const { id } = await params;
  const row = await prisma.inboxPayment.findUnique({ where: { id } });
  if (!row) return goWithMessage(request, "/platby/nesparovane", "error", "E-mail nebyl nalezen.");
  await prisma.inboxPayment.update({ where: { id }, data: { status: "IGNORED", parseNote: `${row.parseNote || ""} Ručně označeno jako nerelevantní.`.trim() } });
  await audit(user.id, "INBOUND_PAYMENT_IGNORED", "InboxPayment", id);
  return goWithMessage(request, "/platby/nesparovane", "ok", "E-mail byl označen jako nerelevantní.");
}
