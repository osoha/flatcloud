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
import styles from "./users.module.css";
import { RefreshActivity } from "@/components/admin/RefreshActivity";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; invite?: string; activity?: string; kind?: string; role?: string; property?: string; sort?: string; q?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");

  const [storedUsers, invitations, properties, query, logins, linkedOwners] = await Promise.all([
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
        avatarChoice: true,
        updatedAt: true,
        activity: { select: { lastSeenAt: true } },
        memberships: { include: { property: true } },
        unitMemberships: { include: { unit: { include: { property: true } } } },
        tenantPortalAccesses: { include: { tenant: { include: {
          leases: { select: { unit: { select: { propertyId: true } } } },
          leaseParties: { select: { lease: { select: { unit: { select: { propertyId: true } } } } } },
        } } } },
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
    prisma.owner.findMany({ where: { userId: { not: null } }, select: { userId: true, name: true } }),
  ]);
  const propertyOverview=await userPropertyOverview();
  const ownerNames=new Map<string,string[]>();
  for (const owner of linkedOwners) if (owner.userId) ownerNames.set(owner.userId,[...(ownerNames.get(owner.userId)||[]),owner.name]);
  const now = new Date(), activityView = parseActivityView(query.activity);
  const loginDates = new Map(logins.map(row => [row.userId, row._max.createdAt]));
  const baseUsers = filterAndSortActivity(storedUsers.map(row => ({ ...row, lastActivityAt: latestActivityAt(row.activity?.lastSeenAt, loginDates.get(row.id)), online: isUserOnline(row.active, row.activity?.lastSeenAt, now) })), activityView, now);
  const portalPropertyIds=(row:typeof baseUsers[number])=>new Set(row.tenantPortalAccesses.flatMap(access=>[...access.tenant.leases.map(lease=>lease.unit.propertyId),...access.tenant.leaseParties.map(party=>party.lease.unit.propertyId)]));
  const users=baseUsers.filter(row=>{
    const kind=query.kind||"all", portal=row.tenantPortalAccesses.length>0;
    const linkedOwner=ownerNames.has(row.id);
    const matchesKind=kind==="all"||kind==="tenant"&&portal||kind==="manager"&&["PROPERTY_MANAGER","MANAGER"].includes(row.role)||kind==="owner"&&linkedOwner||kind==="member"&&row.role==="OWNER_VIEWER"&&!linkedOwner;
    const matchesRole=!query.role||query.role==="all"||row.role===query.role;
    const matchesProperty=!query.property||query.property==="all"||row.allProperties||row.memberships.some(m=>m.propertyId===query.property)||row.unitMemberships.some(m=>m.unit.propertyId===query.property)||portalPropertyIds(row).has(query.property);
    return matchesKind&&matchesRole&&matchesProperty&&(!query.q||`${row.name} ${row.email}`.toLocaleLowerCase("cs").includes(query.q.toLocaleLowerCase("cs")));
  }).sort((a,b)=>query.sort==="recent"?(b.lastActivityAt?.getTime()||0)-(a.lastActivityAt?.getTime()||0):query.sort==="property"?(a.memberships[0]?.property.name||a.tenantPortalAccesses[0]?.tenant.leases[0]?.unit.propertyId||"").localeCompare(b.memberships[0]?.property.name||b.tenantPortalAccesses[0]?.tenant.leases[0]?.unit.propertyId||"","cs"):a.name.localeCompare(b.name,"cs"));

  return <Shell user={user}><div className={`page ${styles.page}`}>
    <div className="page-title"><div><PageHeading>Uživatelé a oprávnění</PageHeading><p>Jeden člen může mít přístup k více objektům nebo ke všem současným i budoucím nemovitostem.</p></div></div>
    <AdminSubnav active="users"/>
    <Flash ok={query.ok} error={query.error}/>
    {query.invite && <div className="invite-link-box"><strong>Odkaz k ručnímu předání</strong><input readOnly value={query.invite}/></div>}


    <div className={styles.createSections}>
      <details className={`card ${styles.createSection}`} data-testid="add-user"><summary><strong>Přidat uživatele</strong></summary><p className="muted-copy">Existujícímu aktivnímu účtu přístup rovnou rozšíříme; novému uživateli pošleme pozvánku k nastavení hesla.</p>
        <form className="compact-form" action="/api/invitations/create" method="post">
          <label className="field"><span>Jméno a příjmení</span><input name="name" required/></label>
          <label className="field"><span>E-mail</span><input name="email" type="email" required/></label>
          <label className="field"><span>Role</span><select name="role" defaultValue="OWNER_VIEWER"><option value="OWNER_VIEWER">Vlastník / člen</option><option value="PROPERTY_MANAGER">Správce nemovitosti</option><option value="MANAGER">Generální správce</option><option value="SUPER_ADMIN">Hlavní administrátor</option></select><small>Generální správce a hlavní administrátor mají přístup ke všem nemovitostem.</small></label>
          <label className="checkbox-field"><input type="checkbox" name="allProperties"/><span>Všechny současné i budoucí nemovitosti</span></label>
          <label className="field"><span>Celé nemovitosti</span><select name="propertyIds" multiple size={Math.min(7, Math.max(3, properties.length))}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}{!property.active ? " (archivovaná)" : ""} – {property.address}</option>)}</select></label>
          <div className="field unit-access-picker"><span>Jen vybrané jednotky</span>{properties.map((property) => <details key={property.id}><summary>{property.name}{!property.active ? " (archivovaná)" : ""}</summary>{property.units.map((unit) => <label className="checkbox-field" key={unit.id}><input type="checkbox" name="unitIds" value={unit.id}/><span>{unit.label}</span></label>)}</details>)}</div>
          <label className="field"><span>Oprávnění</span><select name="permission" defaultValue="VIEW"><option value="VIEW">Pouze zobrazení</option><option value="EDIT">Zobrazení a editace</option><option value="ADMIN">Správa objektu a uživatelů</option></select></label>
          <button className="primary" type="submit">Přidat uživatele</button>
        </form>
      </details>

      <details className={`card ${styles.createSection}`}>
        <summary><strong>Pokročilé: vytvořit účet bez pozvánky</strong></summary>
        <p className="muted-copy">Používejte pouze pro servisní/importní účty nebo když uživatel nemůže převzít e-mailovou pozvánku.</p>
        <form className="compact-form" action="/api/users/create" method="post">
          <label className="field"><span>Jméno a příjmení</span><input name="name" required/></label>
          <label className="field"><span>E-mail</span><input name="email" type="email" required/></label>
          <label className="field"><span>Dočasné heslo</span><input name="password" type="password" minLength={12} required/></label>
          <label className="field"><span>Globální role</span><select name="role" defaultValue="OWNER_VIEWER"><option value="OWNER_VIEWER">Vlastník / člen</option><option value="PROPERTY_MANAGER">Správce nemovitosti</option><option value="MANAGER">Generální správce</option><option value="SUPER_ADMIN">Hlavní administrátor</option></select></label>
          <label className="checkbox-field"><input type="checkbox" name="allProperties"/><span>Všechny současné i budoucí nemovitosti</span></label>
          <label className="field"><span>Celé nemovitosti</span><select name="propertyIds" multiple size={Math.min(7, Math.max(3, properties.length))}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}{!property.active ? " (archivovaná)" : ""} – {property.address}</option>)}</select><small>Pro správce objektů. Více položek označte pomocí Ctrl/Cmd.</small></label>
          <div className="field unit-access-picker"><span>Jen vybrané jednotky</span>{properties.map((property) => <details key={property.id}><summary>{property.name}{!property.active ? " (archivovaná)" : ""}</summary>{property.units.map((unit) => <label className="checkbox-field" key={unit.id}><input type="checkbox" name="unitIds" value={unit.id}/><span>{unit.label}</span></label>)}</details>)}</div>
          <label className="field"><span>Oprávnění pro vybrané objekty</span><select name="permission" defaultValue="VIEW"><option value="VIEW">Pouze zobrazení</option><option value="EDIT">Zobrazení a editace</option><option value="ADMIN">Správa objektu a uživatelů</option></select></label>
          <button className="primary" type="submit">Vytvořit účet</button>
        </form>
      </details>
    </div>

    <div className="card portfolio-table-card" id="seznam-uzivatelu" style={{ marginTop: 16 }}>
      <div className="table-toolbar"><div><h2>Uživatelské účty</h2><p>Otevřete profil uživatele a zkontrolujte jeho přístup k domům i jednotlivým jednotkám.</p></div></div>
      <div className={styles.filters}><form method="get" action="/uzivatele#seznam-uzivatelu" className="registry-filters"><label>Hledat<input name="q" defaultValue={query.q||""} placeholder="Jméno nebo e-mail"/></label><label>Typ osoby<select name="kind" defaultValue={query.kind||"all"}><option value="all">Všichni</option><option value="owner">Propojení vlastníci</option><option value="member">Ostatní členové</option><option value="manager">Správci</option><option value="tenant">S přístupem nájemníka</option></select></label><label>Role účtu<select name="role" defaultValue={query.role||"all"}><option value="all">Všechny role</option>{Object.entries(userRoles).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>Nemovitost<select name="property" defaultValue={query.property||"all"}><option value="all">Všechny</option>{properties.map(property=><option value={property.id} key={property.id}>{property.name}{!property.active ? " (archivovaná)" : ""}</option>)}</select></label><label>Řadit<select name="sort" defaultValue={query.sort||"name"}><option value="name">Jméno</option><option value="recent">Poslední aktivita</option><option value="property">Nemovitost</option></select></label><input type="hidden" name="activity" value={activityView}/><button className="secondary">Filtrovat</button></form>
    <form action="/uzivatele#seznam-uzivatelu" method="get" className="user-activity-filters">
      {["q", "kind", "role", "property", "sort"].map(key => <input key={key} type="hidden" name={key} value={query[key as keyof typeof query] || ""}/>)}
      <label className="field"><span>Aktivita uživatelů</span><select name="activity" defaultValue={activityView}><option value="name">Běžné řazení — podle jména</option><option value="online">Online přednostně</option><option value="inactive">Neaktivní déle než 30 dní</option><option value="unseen">Bez záznamu aktivity</option></select></label>
      <button type="submit" className="secondary">Zobrazit účty</button><RefreshActivity/>
    </form>
    <p className="user-activity-note">Online = viditelná karta aplikace během posledních 2 minut. Stav k {now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" })}. Bez záznamu aktivity znamená, že zatím nemáme potvrzenou aktivitu ani historické přihlášení; nejde o deaktivovaný účet.</p>
      </div>
      <div className="table-wrap"><table className={styles.usersTable}>
        <thead><tr><th>Uživatel</th><th>Role a skupina</th><th>Udělený přístup</th><th>Vztah k portfoliu</th><th>Poslední aktivita</th><th>Akce</th></tr></thead>
        <tbody>{users.length ? users.map((row) => {
          const href = `/uzivatele/${row.id}`;
          const relations=propertyOverview(row.id);
          const globalScope = row.allProperties || row.role === "SUPER_ADMIN" || row.role === "MANAGER";
          return <tr key={row.id}>
            <td data-label="Uživatel"><Link className={styles.identity} href={href}><UserAvatar user={row} className={row.online ? "user-online" : ""}/><span><strong>{row.name}</strong><small>{row.email}</small></span></Link><div className={styles.identityStatus}><span className={`status ${row.active ? "ok" : "bad"}`}>{row.active ? "Aktivní" : "Deaktivovaný"}</span>{row.online && <span className="user-activity-online">Online</span>}</div></td>
            <td data-label="Role a skupina"><strong>{userRoles[row.role]}</strong><small>{isFlatcloudMember(row) ? "Skupina FlatCloud" : "Externí prostředí"}</small>{ownerNames.has(row.id) && <small>Propojený vlastník: {ownerNames.get(row.id)!.join(", ")}</small>}</td>
            <td data-label="Udělený přístup"><Link href={href} className={styles.accessList}>{globalScope ? <strong>Celé portfolio</strong> : <>{row.memberships.map(m => <span key={m.propertyId}><strong>{m.property.name}{!m.property.active && " · archiv"}</strong><small>{propertyPermissions[m.permission]} · celý dům</small></span>)}{row.unitMemberships.map(m => <span key={m.unitId}><strong>{m.unit.property.name} · {m.unit.label}{!m.unit.property.active && " · archiv"}</strong><small>{propertyPermissions[m.permission]}</small></span>)}{!row.memberships.length && !row.unitMemberships.length && <span>Bez přístupu do portfolia</span>}</>}</Link>{row.tenantPortalAccesses.length > 0 && <div className={styles.portalLinks}><small>Portál nájemníka</small>{row.tenantPortalAccesses.map(access => <Link key={access.tenantId} href={`/najemnici/${access.tenantId}`}>{access.tenant.name}</Link>)}</div>}</td>
            <td data-label="Vztah k portfoliu"><Link href={`${href}#nemovitosti`}><strong>{relations.length} domů / {relations.reduce((n,p) => n + (p.roles.some(r => ["Založil","Spravuje","Vlastník"].includes(r)) ? p.units : p.accessibleUnits), 0)} jednotek</strong><small>Založil {relations.filter(p => p.roles.includes("Založil")).length} · spravuje {relations.filter(p => p.roles.includes("Spravuje")).length} · vlastník {relations.filter(p => p.roles.includes("Vlastník")).length}</small></Link></td>
            <td data-label="Poslední aktivita">{row.lastActivityAt ? <time dateTime={row.lastActivityAt.toISOString()}>{row.lastActivityAt.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" })}<small>{row.lastActivityAt.toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" })}</small></time> : <small>Dosud nezaznamenána</small>}</td>
            <td data-label="Akce"><div className={styles.rowActions}><Link className="secondary" href={href}>Upravit</Link>{row.active && row.id !== user.id && <form action="/api/admin/user-preview" method="post"><input type="hidden" name="userId" value={row.id}/><button className="secondary">Pohled uživatele</button></form>}</div></td>
          </tr>;
        }) : <tr><td colSpan={6} className="table-empty">Vybranému filtru neodpovídá žádný účet.</td></tr>}</tbody>
      </table></div>
    </div>

    <div className="card portfolio-table-card" id="cekajici-pozvanky" style={{ marginTop: 16 }}>
      <div className="table-toolbar"><div><h2>Čekající pozvánky</h2><p>Nové odeslání nebo úprava vždy zneplatní předchozí odkaz.</p></div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Jméno / e-mail</th><th>Role účtu</th><th>Rozsah</th><th>Oprávnění</th><th>Pozval</th><th>Platnost</th><th></th></tr></thead>
        <tbody>{invitations.length ? invitations.map((invitation) => <tr key={invitation.id}>
          <td><strong>{invitation.name || "—"}</strong><span className="owner-sub">{invitation.email}</span></td>
          <td>{userRoles[invitation.role]||invitation.role}</td>
          <td>{invitation.allProperties ? "Všechny nemovitosti" : invitation.propertyIds.length ? `${invitation.propertyIds.length} objektů` : invitation.property.name}</td>
          <td>{propertyPermissions[invitation.permission]}</td>
          <td>{invitation.invitedBy.name}</td>
          <td>{invitation.expiresAt.toLocaleDateString("cs-CZ")}</td>
          <td><div className="pending-invite-actions"><form action={`/api/invitations/${invitation.id}/rotate`} method="post"><input type="hidden" name="returnTo" value="/uzivatele"/><button className="secondary" name="mode" value="resend" type="submit">Odeslat znovu</button></form><DismissibleDetails viewportModal summary="Upravit oprávnění" dialogLabel={`Upravit oprávnění pozvánky ${invitation.email}`}><form className="compact-form" action={`/api/invitations/${invitation.id}/rotate`} method="post"><input type="hidden" name="returnTo" value="/uzivatele"/><input type="hidden" name="mode" value="edit"/><label className="checkbox-field"><input type="checkbox" name="allProperties" defaultChecked={invitation.allProperties}/><span>Všechny nemovitosti</span></label><label className="field"><span>Celé nemovitosti</span><select name="propertyIds" multiple defaultValue={invitation.propertyIds}>{properties.map((property)=><option value={property.id} key={property.id}>{property.name}{!property.active ? " (archivovaná)" : ""}</option>)}</select></label><div className="field unit-access-picker"><span>Jen vybrané jednotky</span>{properties.map((property)=><details key={property.id}><summary>{property.name}{!property.active ? " (archivovaná)" : ""}</summary>{property.units.map((unit)=><label className="checkbox-field" key={unit.id}><input type="checkbox" name="unitIds" value={unit.id} defaultChecked={invitation.unitIds.includes(unit.id)}/><span>{unit.label}</span></label>)}</details>)}</div><label className="field"><span>Role</span><select name="role" defaultValue={invitation.role}>{Object.entries(userRoles).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Oprávnění</span><select name="permission" defaultValue={invitation.permission}>{Object.entries(propertyPermissions).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><button className="secondary">Uložit a odeslat novou</button></form></DismissibleDetails><form action={`/api/invitations/${invitation.id}/revoke`} method="post"><input type="hidden" name="returnTo" value="/uzivatele"/><button className="danger-button" type="submit">Zrušit</button></form></div></td>
        </tr>) : <tr><td colSpan={7} className="table-empty">Bez čekajících pozvánek</td></tr>}</tbody>
      </table></div>
    </div>
  </div></Shell>;
}
