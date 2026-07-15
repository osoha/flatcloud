import { prisma } from "@/lib/db";
import { requirePropertyAdmin, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  const invitation = await prisma.userInvitation.findUnique({ where: { id: inviteId } });
  if (!invitation) return go(request, "/portfolio");
  const access = await requirePropertyAdmin(invitation.propertyId);
  if (!access) return go(request, "/login");
  await prisma.userInvitation.update({ where: { id: inviteId }, data: { status: "REVOKED" } });
  await audit(access.user.id, "INVITATION_REVOKED", "UserInvitation", inviteId, { propertyId: invitation.propertyId, email: invitation.email });
  return goWithMessage(request, `/nemovitosti/${invitation.propertyId}/uzivatele`, "ok", "Pozvánka byla zrušena.");
}
