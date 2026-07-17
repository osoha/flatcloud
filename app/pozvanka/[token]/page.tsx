import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashInvitationToken } from "@/lib/invitations";
import { propertyPermissions } from "@/lib/labels";
import { Flash } from "@/components/FormUi";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const invitation = await prisma.userInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { property: true, invitedBy: { select: { id: true, name: true } } },
  });
  if (!invitation) notFound();
  const expired = invitation.expiresAt.getTime() < Date.now();
  const existing = await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
  const valid = invitation.status === "PENDING" && !expired;
  return <div className="login-page"><div className="login-card invite-card"><div className="login-logo"><Image src="/flatcloud-logo.png" width={210} height={51} alt="FlatCloud" priority/></div><h1>Pozvánka do FlatCloud Rent</h1><p><strong>{invitation.invitedBy.name}</strong> vás pozval do systému FlatCloud Rent.</p><div className="summary-list invite-summary"><div><span>E-mail</span><strong>{invitation.email}</strong></div><div><span>Rozsah</span><strong>{invitation.allProperties ? "Všechny současné i budoucí nemovitosti" : invitation.propertyIds.length > 1 ? `${invitation.propertyIds.length} nemovitostí` : invitation.property.name}</strong></div><div><span>Oprávnění</span><strong>{propertyPermissions[invitation.permission]}</strong></div><div><span>Platnost do</span><strong>{invitation.expiresAt.toLocaleDateString("cs-CZ")}</strong></div></div><Flash error={query.error}/>{valid ? <form action="/api/invitations/accept" method="post" className="account-form"><input type="hidden" name="token" value={token}/>{!existing && <label className="field"><span>Jméno a příjmení</span><input name="name" defaultValue={invitation.name || ""} required/></label>}<label className="field"><span>{existing ? "Heslo k existujícímu účtu" : "Nové heslo (min. 12 znaků)"}</span><input name="password" type="password" minLength={12} required/></label><button className="primary" type="submit">Přijmout pozvánku</button></form> : <div className="error">Tato pozvánka už není platná. Požádejte správce nemovitosti o novou.</div>}<p className="demo-note">Po přijetí uvidíte pouze nemovitosti a funkce, ke kterým vám byl udělen přístup.</p></div></div>;
}
