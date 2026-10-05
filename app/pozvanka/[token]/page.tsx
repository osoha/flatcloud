import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
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
  if (!invitation) return <main className="login-page"><div className="login-card invite-card"><PageHeading>Pozvánka není dostupná</PageHeading><p>Odkaz je neplatný nebo byl nahrazen. Požádejte o novou pozvánku.</p><nav className="auth-footer-links" aria-label="Další možnosti"><Link href="/login">Přejít na přihlášení</Link><Link href="/">Zpět na web FlatBerry</Link></nav></div></main>;
  const expired = invitation.expiresAt.getTime() < Date.now();
  const existing = await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
  const valid = invitation.status === "PENDING" && !expired;
  return <div className="login-page"><div className="login-card invite-card"><div className="login-logo"><span className="flatberry-brand-bitmap" role="img" aria-label="FlatBerry"/></div><PageHeading>{invitation.tenantId?"Pozvánka do Portálu nájemníka":"Pozvánka do FlatBerry"}</PageHeading><p><strong>{invitation.invitedBy.name}</strong> vás pozval do systému FlatBerry.</p><div className="summary-list invite-summary"><div><span>E-mail</span><strong>{invitation.email}</strong></div><div><span>Rozsah</span><strong>{invitation.tenantId?"Váš nájemní vztah":invitation.allProperties ? "Všechny současné i budoucí nemovitosti" : invitation.propertyIds.length > 1 ? `${invitation.propertyIds.length} nemovitostí` : invitation.property.name}</strong></div><div><span>Oprávnění</span><strong>{invitation.tenantId?"Portál nájemníka":propertyPermissions[invitation.permission]}</strong></div><div><span>Platnost do</span><strong>{invitation.expiresAt.toLocaleDateString("cs-CZ")}</strong></div></div><Flash error={query.error}/>{valid ? <form action="/api/invitations/accept" method="post" className="account-form"><input type="hidden" name="token" value={token}/>{!existing && <label className="field"><span>Jméno a příjmení</span><input name="name" defaultValue={invitation.name || ""} required/></label>}<label className="field"><span>{existing ? "Heslo k existujícímu účtu" : "Nové heslo (min. 12 znaků)"}</span><input name="password" type="password" minLength={12} required/></label><button className="primary" type="submit">Přijmout pozvánku</button></form> : <div className="error">Tato pozvánka už není platná. Požádejte správce nemovitosti o novou.</div>}<p className="demo-note">Po přijetí uvidíte informace podle uděleného přístupu.</p><nav className="auth-footer-links" aria-label="Další možnosti"><Link href="/login">Přejít na přihlášení</Link><Link href="/">Zpět na web FlatBerry</Link></nav></div></div>;
}
