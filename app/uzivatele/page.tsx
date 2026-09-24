import { userPropertyOverview } from "@/lib/user-property-overview";
import { isFlatcloudMember } from "@/lib/user-context-policy";
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { propertyPermissions, userRoles } from "@/lib/labels";
import { UserAvatar } from "@/components/UserAvatar";
import { AdminSubnav } from "@/components/admin/AdminSubnav";
import { DismissibleDetails } from "@/components/DismissibleDetails";
import { filterAndSortActivity, isUserOnline, latestActivityAt, parseActivityView } from "@/lib/user-activity-policy";
import { RefreshActivity } from "@/components/admin/RefreshActivity";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; invite?: string; activity?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");

  const [storedUsers, invitations, properties, query, logins] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        allProperties: true,
        flatcloudMember: true,
        avatarMimeType: true,
        updatedAt: true,
        activity: { select: { lastSeenAt: true } },
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
    prisma.auditLog.groupBy({ by: ["userId"], where: { action: "LOGIN", entityType: "User" }, _max: { createdAt: true } }),
  ]);
  const propertyOverview=await userPropertyOverview();
  const now = new Date(), activityView = parseActivityView(query.activity);
  const loginDates = new Map(logins.map(row => [row.userId, row._max.createdAt]));
  const users = filterAndSortActivity(storedUsers.map(row => ({ ...row, lastActivityAt: latestActivityAt(row.activity?.lastSeenAt, loginDates.get(row.id)), online: isUserOnline(row.active, row.activity?.lastSeenAt, now) })), activityView, now);

  return <Shell user={user}><div className="page">
    <div className="page-title"><div><PageHeading>Uživatelé a oprávnění</PageHeading><p>Jeden člen může mít přístup k více objektům nebo ke všem současným i budoucím nemovitostem.</p></div></div>
    <AdminSubnav active="users"/>
    <Flash ok={query.ok} error={query.error}/>
    {query.invite && <div className="invite-link-box"><strong>Odkaz k ručnímu předání</strong><input readOnly value={query.invite}/></div>}


    <div className="detail-grid users-create-grid">
      <details className="card col-12">
        <summary><strong>Pokročilé: vytvořit účet bez pozvánky</strong></summary>
        <p className="muted-copy">Používejte pouze pro servisní/importní účty nebo když uživatel nemůže převzít e-mailovou pozvánku.</p>
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
      </details>

      <div className="card col-12">
        <h2>Přidat uživatele</h2><p className="muted-copy">Existujícímu aktivnímu účtu přístup rovnou rozšíříme; novému uživateli pošleme pozvánku k nastavení hesla.</p>
        <form className="compact-form" action="/api/invitations/create" method="post">
          <label className="field"><span>Jméno a příjmení</span><input name="name" required/></label>
          <label className="field"><span>E-mail</span><input name="email" type="email" required/></label>
          <label className="field"><span>Role</span><select name="role" defaultValue="OWNER_VIEWER"><option value="OWNER_VIEWER">Vlastník / člen</option><option value="PROPERTY_MANAGER">Správce nemovitosti</option><option value="MANAGER">Generální správce</option><option value="SUPER_ADMIN">Hlavní administrátor</option></select><small>Generální správce a hlavní administrátor mají přístup ke všem nemovitostem.</small></label>
          <label className="checkbox-field"><input type="checkbox" name="allProperties"/><span>Všechny současné i budoucí nemovitosti</span></label>
          <label className="field"><span>Celé nemovitosti</span><select name="propertyIds" multiple size={Math.min(7, Math.max(3, properties.length))}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} – {property.address}</option>)}</select></label>
          <div className="field unit-access-picker"><span>Jen vybrané jednotky</span>{properties.map((property) => <details key={property.id}><summary>{property.name}</summary>{property.units.map((unit) => <label className="checkbox-field" key={unit.id}><input type="checkbox" name="unitIds" value={unit.id}/><span>{unit.label}</span></label>)}</details>)}</div>
          <label className="field"><span>Oprávnění</span><select name="permission" defaultValue="VIEW"><option value="VIEW">Pouze zobrazení</option><option value="EDIT">Zobrazení a editace</option><option value="ADMIN">Správa objektu a uživatelů</option></select></label>
          <button className="primary" type="submit">Přidat uživatele</button>
        </form>
      </div>
    </div>

    <div className="card portfolio-table-card" id="seznam-uzivatelu" style={{ marginTop: 16 }}>
      <div className="table-toolbar"><div><h2>Uživatelské účty</h2><p>Kliknutím na libovolné místo řádku otevřete profil a oprávnění uživatele.</p></div></div>
      <div className="user-activity-controls">
    <form action="/uzivatele#seznam-uzivatelu" method="get" className="user-activity-filters">
      <label className="field"><span>Aktivita uživatelů</span><select name="activity" defaultValue={activityView}><option value="name">Běžné řazení — podle jména</option><option value="online">Online přednostně</option><option value="inactive">Neaktivní déle než 30 dní</option><option value="unseen">Bez záznamu aktivity</option></select></label>
      <button type="submit" className="secondary">Zobrazit účty</button><RefreshActivity/>
    </form>
    <p className="user-activity-note">Online = viditelná karta aplikace během posledních 2 minut. Stav k {now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" })}. Bez záznamu aktivity znamená, že zatím nemáme potvrzenou aktivitu ani historické přihlášení; nejde o deaktivovaný účet.</p>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Uživatel</th><th>Role</th><th>Nemovitosti</th><th>Vztah k portfoliu</th><th>Stav</th><th>Poslední aktivita</th><th></th></tr></thead>
        <tbody>{users.length ? users.map((row) => {
          const href = `/uzivatele/${row.id}`;
          const relations=propertyOverview(row.id);
          const accessLabel = row.allProperties || row.role === "SUPER_ADMIN" || row.role === "MANAGER"
            ? "Všechny současné i budoucí"
            : row.memberships.length
              ? row.memberships.map((membership) => `${membership.property.name} (${propertyPermissions[membership.permission]})`).join(", ")
              : row.unitMemberships.length
                ? row.unitMemberships.map((membership) => `${membership.unit.property.name} / ${membership.unit.label}`).join(", ")
                : "Bez přístupu";
          return <tr className="clickable-table-row" key={row.id}>
            <td><Link className="row-cell-link" href={href}><div className="user-table-cell"><UserAvatar user={row} className={row.online ? "user-online" : ""}/><div><strong>{row.name}</strong><span className="owner-sub">{row.email}</span>{row.online && <span className="user-activity-online">Online</span>}</div></div></Link></td>
            <td><Link className="row-cell-link" href={href}>{userRoles[row.role]}<small className="owner-sub">{isFlatcloudMember(row)?"Skupina FlatCloud":"Externí prostředí"}</small></Link></td>
            <td><Link className="row-cell-link" href={href}>{accessLabel}</Link></td><td><Link className="row-cell-link" href={`${href}#nemovitosti`}>{relations.length} domů / {relations.reduce((n,p)=>n+(p.roles.some(r=>["Založil","Spravuje","Vlastník"].includes(r))?p.units:p.accessibleUnits),0)} jednotek<small className="owner-sub">Založil {relations.filter(p=>p.roles.includes("Založil")).length} · spravuje {relations.filter(p=>p.roles.includes("Spravuje")).length} · vlastník {relations.filter(p=>p.roles.includes("Vlastník")).length}</small></Link></td>
            <td><Link className="row-cell-link" href={href}><span className={`status ${row.active ? "ok" : "bad"}`}>{row.active ? "Aktivní" : "Deaktivovaný"}</span></Link></td>
            <td><Link className="row-cell-link" href={href}>{row.lastActivityAt ? <time dateTime={row.lastActivityAt.toISOString()}>{row.lastActivityAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", dateStyle: "short", timeStyle: "short" })}</time> : "Dosud nezaznamenána"}</Link></td>
            <td><Link className="table-link" href={href}>Upravit</Link>{row.active && row.id !== user.id && <form action="/api/admin/user-preview" method="post"><input type="hidden" name="userId" value={row.id}/><button className="secondary">Pohled uživatele</button></form>}</td>
          </tr>;
        }) : <tr><td colSpan={7} className="table-empty">Vybranému filtru neodpovídá žádný účet.</td></tr>}</tbody>
      </table></div>
    </div>

    <div className="card portfolio-table-card" id="cekajici-pozvanky" style={{ marginTop: 16 }}>
      <div className="table-toolbar"><div><h2>Čekající pozvánky</h2><p>Nové odeslání nebo úprava vždy zneplatní předchozí odkaz.</p></div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Jméno / e-mail</th><th>Rozsah</th><th>Oprávnění</th><th>Pozval</th><th>Platnost</th><th></th></tr></thead>
        <tbody>{invitations.length ? invitations.map((invitation) => <tr key={invitation.id}>
          <td><strong>{invitation.name || "—"}</strong><span className="owner-sub">{invitation.email}</span></td>
          <td>{invitation.allProperties ? "Všechny nemovitosti" : invitation.propertyIds.length ? `${invitation.propertyIds.length} objektů` : invitation.property.name}</td>
          <td>{propertyPermissions[invitation.permission]}</td>
          <td>{invitation.invitedBy.name}</td>
          <td>{invitation.expiresAt.toLocaleDateString("cs-CZ")}</td>
          <td><div className="pending-invite-actions"><form action={`/api/invitations/${invitation.id}/rotate`} method="post"><input type="hidden" name="returnTo" value="/uzivatele"/><button className="secondary" name="mode" value="resend" type="submit">Odeslat znovu</button></form><DismissibleDetails viewportModal summary="Upravit oprávnění" dialogLabel={`Upravit oprávnění pozvánky ${invitation.email}`}><form className="compact-form" action={`/api/invitations/${invitation.id}/rotate`} method="post"><input type="hidden" name="returnTo" value="/uzivatele"/><input type="hidden" name="mode" value="edit"/><label className="checkbox-field"><input type="checkbox" name="allProperties" defaultChecked={invitation.allProperties}/><span>Všechny nemovitosti</span></label><label className="field"><span>Celé nemovitosti</span><select name="propertyIds" multiple defaultValue={invitation.propertyIds}>{properties.map((property)=><option value={property.id} key={property.id}>{property.name}</option>)}</select></label><div className="field unit-access-picker"><span>Jen vybrané jednotky</span>{properties.map((property)=><details key={property.id}><summary>{property.name}</summary>{property.units.map((unit)=><label className="checkbox-field" key={unit.id}><input type="checkbox" name="unitIds" value={unit.id} defaultChecked={invitation.unitIds.includes(unit.id)}/><span>{unit.label}</span></label>)}</details>)}</div><label className="field"><span>Role</span><select name="role" defaultValue={invitation.role}>{Object.entries(userRoles).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Oprávnění</span><select name="permission" defaultValue={invitation.permission}>{Object.entries(propertyPermissions).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><button className="secondary">Uložit a odeslat novou</button></form></DismissibleDetails><form action={`/api/invitations/${invitation.id}/revoke`} method="post"><input type="hidden" name="returnTo" value="/uzivatele"/><button className="danger-button" type="submit">Zrušit</button></form></div></td>
        </tr>) : <tr><td colSpan={6} className="table-empty">Bez čekajících pozvánek</td></tr>}</tbody>
      </table></div>
    </div>
  </div></Shell>;
}
