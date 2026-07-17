import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { propertyPermissions, userRoles } from "@/lib/labels";
import { UserAvatar } from "@/components/UserAvatar";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; invite?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");

  const [users, invitations, properties, query] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        allProperties: true,
        avatarMimeType: true,
        updatedAt: true,
        memberships: { include: { property: true } },
        unitMemberships: { include: { unit: { include: { property: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.userInvitation.findMany({
      where: { status: "PENDING" },
      include: { property: true, invitedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.property.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { units: { orderBy: { label: "asc" } } } }),
    searchParams,
  ]);

  return <Shell user={user}><div className="page">
    <div className="page-title"><div><h1>Uživatelé a oprávnění</h1><p>Jeden člen může mít přístup k více objektům nebo ke všem současným i budoucím nemovitostem.</p></div></div>
    <Flash ok={query.ok} error={query.error}/>
    {query.invite && <div className="invite-link-box"><strong>Odkaz k ručnímu předání</strong><input readOnly value={query.invite}/></div>}

    <div className="detail-grid users-create-grid">
      <div className="card col-6">
        <h2>Vytvořit uživatele</h2>
        <form className="compact-form" action="/api/users/create" method="post">
          <label className="field"><span>Jméno a příjmení</span><input name="name" required/></label>
          <label className="field"><span>E-mail</span><input name="email" type="email" required/></label>
          <label className="field"><span>Dočasné heslo</span><input name="password" type="password" minLength={12} required/></label>
          <label className="field"><span>Globální role</span><select name="role" defaultValue="OWNER_VIEWER"><option value="OWNER_VIEWER">Vlastník / člen</option><option value="PROPERTY_MANAGER">Správce nemovitosti</option><option value="MANAGER">Generální správce</option><option value="SUPER_ADMIN">Hlavní administrátor</option></select></label>
          <label className="checkbox-field"><input type="checkbox" name="allProperties"/><span>Všechny současné i budoucí nemovitosti</span></label>
          <label className="field"><span>Celé nemovitosti</span><select name="propertyIds" multiple size={Math.min(7, Math.max(3, properties.length))}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} – {property.address}</option>)}</select><small>Pro správce objektů. Více položek označte pomocí Ctrl/Cmd.</small></label>
          <div className="field unit-access-picker"><span>Jen vybrané jednotky</span>{properties.map((property) => <details key={property.id}><summary>{property.name}</summary>{property.units.map((unit) => <label className="checkbox-field" key={unit.id}><input type="checkbox" name="unitIds" value={unit.id}/><span>{unit.label}</span></label>)}</details>)}</div>
          <label className="field"><span>Oprávnění pro vybrané objekty</span><select name="permission" defaultValue="VIEW"><option value="VIEW">Pouze zobrazení</option><option value="EDIT">Zobrazení a editace</option><option value="ADMIN">Správa objektu a uživatelů</option></select></label>
          <button className="primary" type="submit">Vytvořit účet</button>
        </form>
      </div>

      <div className="card col-6">
        <h2>Poslat e-mailovou pozvánku</h2>
        <form className="compact-form" action="/api/invitations/create" method="post">
          <label className="field"><span>Jméno a příjmení</span><input name="name" required/></label>
          <label className="field"><span>E-mail</span><input name="email" type="email" required/></label>
          <label className="checkbox-field"><input type="checkbox" name="allProperties"/><span>Všechny současné i budoucí nemovitosti</span></label>
          <label className="field"><span>Celé nemovitosti</span><select name="propertyIds" multiple size={Math.min(7, Math.max(3, properties.length))}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} – {property.address}</option>)}</select></label>
          <div className="field unit-access-picker"><span>Jen vybrané jednotky</span>{properties.map((property) => <details key={property.id}><summary>{property.name}</summary>{property.units.map((unit) => <label className="checkbox-field" key={unit.id}><input type="checkbox" name="unitIds" value={unit.id}/><span>{unit.label}</span></label>)}</details>)}</div>
          <label className="field"><span>Oprávnění</span><select name="permission" defaultValue="VIEW"><option value="VIEW">Pouze zobrazení</option><option value="EDIT">Zobrazení a editace</option><option value="ADMIN">Správa objektu a uživatelů</option></select></label>
          <button className="primary" type="submit">Odeslat pozvánku</button>
        </form>
      </div>
    </div>

    <div className="card portfolio-table-card" style={{ marginTop: 16 }}>
      <div className="table-toolbar"><div><h2>Aktivní účty</h2><p>Kliknutím na libovolné místo řádku otevřete profil a oprávnění uživatele.</p></div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Uživatel</th><th>Role</th><th>Nemovitosti</th><th>Stav</th><th></th></tr></thead>
        <tbody>{users.length ? users.map((row) => {
          const href = `/uzivatele/${row.id}`;
          const accessLabel = row.allProperties || row.role === "SUPER_ADMIN" || row.role === "MANAGER"
            ? "Všechny současné i budoucí"
            : row.memberships.length
              ? row.memberships.map((membership) => `${membership.property.name} (${propertyPermissions[membership.permission]})`).join(", ")
              : row.unitMemberships.length
                ? row.unitMemberships.map((membership) => `${membership.unit.property.name} / ${membership.unit.label}`).join(", ")
                : "Bez přístupu";
          return <tr className="clickable-table-row" key={row.id}>
            <td><Link className="row-cell-link" href={href}><div className="user-table-cell"><UserAvatar user={row}/><div><strong>{row.name}</strong><span className="owner-sub">{row.email}</span></div></div></Link></td>
            <td><Link className="row-cell-link" href={href}>{userRoles[row.role]}</Link></td>
            <td><Link className="row-cell-link" href={href}>{accessLabel}</Link></td>
            <td><Link className="row-cell-link" href={href}><span className={`status ${row.active ? "ok" : "bad"}`}>{row.active ? "Aktivní" : "Deaktivovaný"}</span></Link></td>
            <td><Link className="row-cell-link table-link" href={href}>Upravit</Link></td>
          </tr>;
        }) : <tr><td colSpan={5} className="table-empty">Bez uživatelů</td></tr>}</tbody>
      </table></div>
    </div>

    <div className="card portfolio-table-card" style={{ marginTop: 16 }}>
      <div className="table-toolbar"><div><h2>Čekající pozvánky</h2><p>Smazání pozvánku zneplatní; odeslaný odkaz už nepůjde přijmout.</p></div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Jméno / e-mail</th><th>Rozsah</th><th>Oprávnění</th><th>Pozval</th><th>Platnost</th><th></th></tr></thead>
        <tbody>{invitations.length ? invitations.map((invitation) => <tr key={invitation.id}>
          <td><strong>{invitation.name || "—"}</strong><span className="owner-sub">{invitation.email}</span></td>
          <td>{invitation.allProperties ? "Všechny nemovitosti" : invitation.propertyIds.length ? `${invitation.propertyIds.length} objektů` : invitation.property.name}</td>
          <td>{propertyPermissions[invitation.permission]}</td>
          <td>{invitation.invitedBy.name}</td>
          <td>{invitation.expiresAt.toLocaleDateString("cs-CZ")}</td>
          <td><form action={`/api/invitations/${invitation.id}/revoke`} method="post"><input type="hidden" name="returnTo" value="/uzivatele"/><button className="danger-button" type="submit">Smazat</button></form></td>
        </tr>) : <tr><td colSpan={6} className="table-empty">Bez čekajících pozvánek</td></tr>}</tbody>
      </table></div>
    </div>
  </div></Shell>;
}
