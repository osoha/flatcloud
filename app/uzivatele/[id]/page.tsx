import Link from "next/link";
import { userPropertyOverview } from "@/lib/user-property-overview";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormPage, Select } from "@/components/FormUi";
import { userRoles } from "@/lib/labels";
import { UserAvatar } from "@/components/UserAvatar";
import { IllustrationPicker } from "@/components/IllustrationPicker";
import { suggestedIllustration } from "@/lib/illustration-library";
import { PermissionLevelSelect } from "./PermissionLevelSelect";
import styles from "./user-access.module.css";
import { isUserOnline } from "@/lib/user-activity-policy";
import { getSubscriptionConfig, subscriptionsSandboxEnabled, summaryForUser } from "@/lib/subscriptions/service";
import { AdminUserSubscriptions } from "@/components/subscriptions/AdminUserSubscriptions";

export const dynamic = "force-dynamic";

export default async function UserEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const admin = await requireUser();
  if (admin.role !== "SUPER_ADMIN") redirect("/portfolio");
  const { id } = await params;
  const [edited, properties, query] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, title: true, role: true, active: true, allProperties: true, flatcloudMember: true, avatarChoice: true, avatarMimeType: true, updatedAt: true, activity: { select: { lastSeenAt: true } }, memberships: true, unitMemberships: true, managedProperties: { select: { id: true, name: true } } } }),
    prisma.property.findMany({ orderBy: { name: "asc" }, include: { units: { orderBy: { label: "asc" } } } }),
    searchParams,
  ]);
  if (!edited) notFound();
  const relationships=(await userPropertyOverview())(id);
  const online = isUserOnline(edited.active, edited.activity?.lastSeenAt);

  const activeSuperAdminCount = await prisma.user.count({ where: { active: true, role: "SUPER_ADMIN" } });
  const locksLastAdmin = edited.active && edited.role === "SUPER_ADMIN" && activeSuperAdminCount === 1;
  const globalScope = edited.allProperties || edited.role === "SUPER_ADMIN" || edited.role === "MANAGER";
  const membershipMap = new Map<string, string>(edited.memberships.map((membership) => [membership.propertyId, String(membership.permission)]));
  const unitMap = new Map<string, string>(edited.unitMemberships.map((membership) => [membership.unitId, String(membership.permission)]));
  const scopeLabel = globalScope
    ? "Celé portfolio"
    : edited.memberships.length
      ? `${edited.memberships.length} ${edited.memberships.length === 1 ? "nemovitost" : edited.memberships.length < 5 ? "nemovitosti" : "nemovitostí"}`
      : edited.unitMemberships.length
        ? `${edited.unitMemberships.length} ${edited.unitMemberships.length === 1 ? "jednotka" : edited.unitMemberships.length < 5 ? "jednotky" : "jednotek"}`
        : "Bez přístupu do portfolia";

  const activeProperties = properties.filter(property => property.active);
  const archivedProperties = properties.filter(property => !property.active);
  const archivedGrantCount = archivedProperties.reduce((count, property) => count + Number(membershipMap.has(property.id)) + property.units.filter(unit => unitMap.has(unit.id)).length, 0);
  const subscriptionData = subscriptionsSandboxEnabled() && edited.role !== "TENANT" ? await Promise.all([getSubscriptionConfig(), summaryForUser(edited.id, { includeBilling: true })]) : null;
  function permissionSections(items: typeof properties) {
    return <>
        <div className={styles.permissionSection}>
          <div className={styles.permissionSectionTitle}><div><h3>Celé nemovitosti</h3><p>Přístup k celému domu zahrnuje i jeho jednotky.</p></div><span className={styles.permissionCount}>{items.filter(property => membershipMap.has(property.id)).length} přiřazeno</span></div>
          <div className={styles.permissionTable}>
            {items.length ? items.map((property) => <div className={styles.permissionRow} key={property.id}>
              <div className={styles.permissionIdentity}><strong>{property.name}</strong><small>{property.address}, {property.city} · {property.units.length} jednotek</small></div>
              <PermissionLevelSelect name={`property:${property.id}`} defaultValue={membershipMap.get(property.id) || ""} ariaLabel={`Oprávnění pro nemovitost ${property.name}`}/>
            </div>) : <div className={styles.emptyState}>Nejsou založené žádné aktivní nemovitosti.</div>}
          </div>
        </div>

        <div className={styles.permissionSection}>
          <div className={styles.permissionSectionTitle}><div><h3>Pouze vybrané jednotky</h3><p>Použijte, když má uživatel vidět jen konkrétní byty nebo prostory. Přístup k celému domu má přednost.</p></div><span className={styles.permissionCount}>{items.flatMap(property => property.units).filter(unit => unitMap.has(unit.id)).length} přiřazeno</span></div>
          <div>
            {items.map((property) => {
              const selectedCount = property.units.filter((unit) => unitMap.has(unit.id)).length;
              return <details className={styles.unitGroup} key={property.id} open={selectedCount > 0}>
                <summary className={styles.unitSummary}><span>{property.name}</span><small>{selectedCount ? `${selectedCount} přiřazeno` : `${property.units.length} jednotek`}</small></summary>
                <div className={styles.unitRows}>
                  {property.units.length ? property.units.map((unit) => <div className={styles.permissionRow} key={unit.id}>
                    <div className={styles.permissionIdentity}><strong>{unit.label}</strong><small>{property.address}</small></div>
                    <PermissionLevelSelect name={`unit:${unit.id}`} defaultValue={unitMap.get(unit.id) || ""} ariaLabel={`Oprávnění pro jednotku ${unit.label} v ${property.name}`}/>
                  </div>) : <div className={styles.emptyState}>Nemovitost nemá založené jednotky.</div>}
                </div>
              </details>;
            })}
          </div>
        </div>

    </>;
  }

  return <Shell user={admin}><div className={styles.editor}><FormPage title={`Uživatel: ${edited.name}`} description="Kontaktní profil a srozumitelné nastavení rozsahu i úrovně oprávnění." backHref="/uzivatele">
    <Flash ok={query.ok} error={query.error}/>
    <section className={`card ${styles.relationships}`} id="nemovitosti"><h2>Vztah uživatele k nemovitostem</h2><p>Osobní vazby k aktivním domům. Přidělená oprávnění včetně archivovaných nemovitostí upravíte níže.</p><div className="table-wrap"><table><thead><tr><th>Dům</th><th>Vztah</th><th>Jednotky domu</th><th>Jednotky s výslovným přístupem</th></tr></thead><tbody>{relationships.map(p=><tr key={p.id}><td><Link href={`/nemovitosti/${p.id}`}>{p.name}</Link></td><td>{p.roles.join(" · ")}</td><td>{p.units}</td><td>{p.accessibleUnits}</td></tr>)}{!relationships.length&&<tr><td colSpan={4}>Bez doloženého osobního vztahu k aktivním domům.</td></tr>}</tbody></table></div></section>
    {online && <p className="user-activity-online">Online · viditelná karta aplikace během posledních 2 minut</p>}
    <section className={`card ${styles.accessOverview}`} data-testid="user-access-overview">
      <div className={styles.overviewHead}><div><h2>Aktuální přístup</h2><p>Rychlý přehled toho, co uživatel právě vidí a v jakém rozsahu může pracovat.</p></div><span className={styles.overviewBadge}>{edited.active ? "Aktivní účet" : "Deaktivovaný účet"}</span></div>
      <div className={styles.overviewGrid}>
        <div className={styles.overviewItem}><span>Role</span><strong>{userRoles[edited.role]}</strong></div>
        <div className={styles.overviewItem}><span>Rozsah</span><strong>{scopeLabel}</strong></div>
        <div className={styles.overviewItem}><span>Celé objekty</span><strong>{globalScope ? "Všechny" : edited.memberships.length}</strong></div>
        <div className={styles.overviewItem}><span>Jen jednotky</span><strong>{globalScope ? "—" : edited.unitMemberships.length}</strong></div>
      </div>
    </section>

    {subscriptionData && <AdminUserSubscriptions userId={edited.id} name={edited.name} email={edited.email} summaries={subscriptionData[1]} config={subscriptionData[0]} properties={properties} flatcloudMember={edited.flatcloudMember || edited.role === "SUPER_ADMIN"}/>}

    <div className={styles.profileActions}>
    {edited.active && edited.role !== "SUPER_ADMIN" && edited.id !== admin.id && <p><a className="secondary" href={`/uzivatele/${edited.id}/obnova-hesla`}>Obnovit heslo uživatele</a></p>}

    {edited.active && edited.id !== admin.id && <form action="/api/admin/user-preview" method="post"><input type="hidden" name="userId" value={edited.id}/><button className="secondary">Pohled uživatele</button></form>}
    </div>
    <form className={styles.formStack} action={`/api/users/${edited.id}`} method="post" encType="multipart/form-data" data-testid="user-access-form">
      {locksLastAdmin && <><input type="hidden" name="role" value={edited.role}/><input type="hidden" name="active" value="on"/><input type="hidden" name="allProperties" value="on"/></>}

      <section className={`card ${styles.sectionCard}`}>
        <div className={styles.sectionHead}><div><h2>Profil uživatele</h2><p>Kontaktní údaje a podoba profilu.</p></div><span className={styles.sectionTag}>Profil</span></div>
        {locksLastAdmin && <div className="notice">Toto je poslední aktivní hlavní administrátor. Jeho roli ani aktivní stav nelze změnit, dokud nevytvoříte dalšího aktivního hlavního administrátora.</div>}
        <div className={styles.profileGrid}>
          <div className={styles.avatarRow}><UserAvatar user={edited} size="lg" className={online ? "user-online" : ""}/><div className={styles.avatarActions}><div><strong>Avatar uživatele</strong><p>Vyberte postavu z knihovny nebo nahrajte vlastní fotografii (PNG, JPG nebo WebP, nejvýše 2 MB).</p></div><details className={styles.avatarPicker}><summary>Změnit avatar nebo fotografii</summary><div className={styles.avatarPickerContent}><IllustrationPicker kind="person" selected={edited.avatarMimeType ? "upload" : edited.avatarChoice || suggestedIllustration("person", edited.id)}/><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp"/>{edited.avatarMimeType&&<label className="checkbox-field"><input type="checkbox" name="removeAvatar"/><span>Odstranit současnou fotografii</span></label>}</div></details></div></div>
          <Field label="Jméno" name="name" defaultValue={edited.name} required/>
          <Field label="E-mail" name="email" defaultValue={edited.email} type="email" required/>
          <Field label="Telefon" name="phone" defaultValue={edited.phone}/>
          <Field label="Funkce / společnost" name="title" defaultValue={edited.title}/>
        </div>
      </section>

      <section className={`card ${styles.sectionCard}`}><h2>Příslušnost ke skupině</h2><p>Členství zpřístupní interní kontext FlatCloud pouze v rozsahu přidělených oprávnění. Vlastnictví ani správa nemovitosti členství neurčuje.</p><input type="hidden" name="membershipFieldPresent" value="1"/><label className="checkbox-field"><input type="checkbox" name="flatcloudMember" defaultChecked={edited.flatcloudMember || edited.role === "SUPER_ADMIN"} disabled={edited.role === "SUPER_ADMIN"}/><span>Uživatel patří do skupiny FlatCloud</span></label><p>Externí uživatel má čisté prostředí FlatBerry. Hlavní administrátor má interní kontext vždy.</p></section>
      <section className={`card ${styles.sectionCard}`}>
        <div className={styles.sectionHead}><div><h2>Role a rozsah přístupu</h2><p>Nejprve určete globální roli a rozsah. Potom níže nastavte konkrétní úroveň pro jednotlivé objekty nebo jednotky.</p></div><span className={styles.sectionTag}>Oprávnění</span></div>
        <div className={styles.accessBasics}>
          <Select label="Globální role" name="role" defaultValue={edited.role} options={Object.entries(userRoles)} disabled={locksLastAdmin}/>
          <label className="checkbox-field"><input type="checkbox" name="active" defaultChecked={edited.active} disabled={locksLastAdmin}/><span>Uživatel je aktivní</span></label>
          <label className={`checkbox-field ${styles.fullRow}`}><input type="checkbox" name="allProperties" defaultChecked={globalScope} disabled={locksLastAdmin}/><span>Přístup ke všem současným i budoucím nemovitostem</span></label>
          <div className={styles.roleNote}><strong>Jak se rozsah vyhodnocuje:</strong> Generální správce a hlavní administrátor mají přístup k celému portfoliu. U ostatních rolí vyberte celé portfolio, konkrétní domy nebo jednotlivé jednotky.</div>
        </div>

        <div className={styles.permissionLegend} aria-label="Vysvětlení úrovní oprávnění">
          <div className={styles.legendItem}><strong>Čtení</strong><span>Zobrazí data, dokumenty a přehledy. Nic nemění.</span></div>
          <div className={styles.legendItem}><strong>Zápis</strong><span>Zobrazí a upravuje provozní data. Nemůže měnit přístupy ostatních.</span></div>
          <div className={styles.legendItem}><strong>Plná správa</strong><span>Nejvyšší oprávnění v přiděleném rozsahu; u objektu zahrnuje i správu uživatelů.</span></div>
        </div>

        {permissionSections(activeProperties)}
        {archivedProperties.length > 0 && <details className={styles.archivedGroup} data-testid="archived-property-permissions">
          <summary><span>Archivované nemovitosti ({archivedProperties.length})</span><small>{archivedGrantCount} udělených přístupů</small></summary>
          <div className={styles.archivedContent}><p className={styles.help}>Zde můžete zkontrolovat a upravit přístup k archivovaným domům i jejich jednotkám. Sbalení sekce uložená práva nemění.</p>{permissionSections(archivedProperties)}</div>
        </details>}

        {edited.managedProperties.length > 0 && <div className="notice">Správce objektů: {edited.managedProperties.map((property) => property.name).join(", ")}</div>}
        <label className={styles.confirmBox}><input type="checkbox" name="confirmAccessChange"/><span><strong>Potvrzení změny přístupu</strong><span>Pokud měním roli, příslušnost ke skupině, aktivní stav nebo rozsah objektů/jednotek, potvrzuji dopad na přístup tohoto uživatele. Bez tohoto potvrzení server změnu oprávnění neuloží.</span></span></label>
      </section>

      <div className={styles.actions}><a className="secondary" href="/uzivatele">Zrušit</a><button className="primary" type="submit">Uložit změny uživatele</button></div>
    </form>
  </FormPage></div></Shell>;
}
