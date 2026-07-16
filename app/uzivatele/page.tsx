import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { propertyPermissions, userRoles } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; invite?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const [users, invitations, properties, query] = await Promise.all([
    prisma.user.findMany({ include: { memberships: { include: { property: true } } }, orderBy: { name: "asc" } }),
    prisma.userInvitation.findMany({ where: { status: "PENDING" }, include: { property: true, invitedBy: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.property.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, address: true } }),
    searchParams,
  ]);

  return <Shell user={user}><div className="page">
    <div className="page-title"><div><h1>Uživatelé a oprávnění</h1><p>Vytvořte účet přímo nebo odešlete bezpečnou e-mailovou pozvánku.</p></div></div>
    <Flash ok={query.ok} error={query.error}/>
    {query.invite && <div className="invite-link-box"><strong>Odkaz k ručnímu předání</strong><input readOnly value={query.invite}/></div>}

    <div className="detail-grid users-create-grid">
      <div className="card col-6">
        <h2>Vytvořit uživatele</h2>
        <p className="muted-copy">Účet bude aktivní okamžitě. Dočasné heslo předejte uživateli bezpečným způsobem.</p>
        <form className="compact-form" action="/api/users/create" method="post">
          <label className="field"><span>Jméno a příjmení</span><input name="name" required/></label>
          <label className="field"><span>E-mail</span><input name="email" type="email" required/></label>
          <label className="field"><span>Dočasné heslo</span><input name="password" type="password" minLength={12} required/><small>Minimálně 12 znaků.</small></label>
          <label className="field"><span>Globální role</span><select name="role" defaultValue="OWNER_VIEWER"><option value="OWNER_VIEWER">Vlastník – omezený přístup</option><option value="PROPERTY_MANAGER">Správce nemovitosti</option><option value="MANAGER">Generální správce – všechny objekty</option><option value="SUPER_ADMIN">Hlavní administrátor</option></select></label>
          <label className="field"><span>První nemovitost</span><select name="propertyId" defaultValue=""><option value="">Bez přiřazení / role vidí všechny</option>{properties.map(property => <option value={property.id} key={property.id}>{property.name} – {property.address}</option>)}</select></label>
          <label className="field"><span>Oprávnění k nemovitosti</span><select name="permission" defaultValue="VIEW"><option value="VIEW">Pouze zobrazení</option><option value="EDIT">Zobrazení a editace</option><option value="ADMIN">Správa objektu a uživatelů</option></select></label>
          <button className="primary" type="submit">Vytvořit účet</button>
        </form>
      </div>

      <div className="card col-6">
        <h2>Poslat e-mailovou pozvánku</h2>
        <p className="muted-copy">Pozvaný si nastaví vlastní heslo. Odkaz je jednorázový a platí 7 dní.</p>
        <form className="compact-form" action="/api/invitations/create" method="post">
          <label className="field"><span>Jméno a příjmení</span><input name="name"/></label>
          <label className="field"><span>E-mail</span><input name="email" type="email" required/></label>
          <label className="field"><span>Nemovitost</span><select name="propertyId" required defaultValue=""><option value="" disabled>Vyberte nemovitost</option>{properties.map(property => <option value={property.id} key={property.id}>{property.name} – {property.address}</option>)}</select></label>
          <label className="field"><span>Oprávnění</span><select name="permission" defaultValue="VIEW"><option value="VIEW">Pouze zobrazení</option><option value="EDIT">Zobrazení a editace</option><option value="ADMIN">Správa objektu a uživatelů</option></select></label>
          <button className="primary" type="submit">Odeslat pozvánku</button>
        </form>
      </div>
    </div>

    <div className="card portfolio-table-card" style={{ marginTop: 16 }}>
      <div className="table-toolbar"><div><h2>Aktivní účty</h2><p>Oprávnění k objektům se upravují v detailu uživatele.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Uživatel</th><th>Role</th><th>Nemovitosti</th><th>Stav</th><th></th></tr></thead><tbody>{users.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><span className="owner-sub">{row.email}</span></td><td>{userRoles[row.role]}</td><td>{row.role === "SUPER_ADMIN" || row.role === "MANAGER" ? "Všechny" : row.memberships.length ? row.memberships.map((membership) => `${membership.property.name} (${propertyPermissions[membership.permission]})`).join(", ") : "Bez přístupu"}</td><td><span className={`status ${row.active ? "ok" : "bad"}`}>{row.active ? "Aktivní" : "Deaktivovaný"}</span></td><td><Link className="table-link" href={`/uzivatele/${row.id}`}>Upravit</Link></td></tr>)}</tbody></table></div>
    </div>

    <div className="card portfolio-table-card" style={{ marginTop: 16 }}>
      <div className="table-toolbar"><div><h2>Čekající pozvánky</h2><p>Pozvánku lze zrušit v detailu příslušné nemovitosti.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>E-mail</th><th>Nemovitost</th><th>Oprávnění</th><th>Pozval</th><th>Platnost</th></tr></thead><tbody>{invitations.length ? invitations.map((invite) => <tr key={invite.id}><td>{invite.email}</td><td><Link className="table-link" href={`/nemovitosti/${invite.propertyId}/uzivatele`}>{invite.property.name}</Link></td><td>{propertyPermissions[invite.permission]}</td><td>{invite.invitedBy.name}</td><td>{invite.expiresAt.toLocaleDateString("cs-CZ")}</td></tr>) : <tr><td colSpan={5} className="table-empty">Bez čekajících pozvánek</td></tr>}</tbody></table></div>
    </div>
  </div></Shell>;
}
