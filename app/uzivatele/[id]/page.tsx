import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormPage, Select } from "@/components/FormUi";
import { userRoles } from "@/lib/labels";
import { UserAvatar } from "@/components/UserAvatar";
import { PermissionLevelSelect } from "./PermissionLevelSelect";
import styles from "./user-access.module.css";
import { isUserOnline } from "@/lib/user-activity-policy";

export const dynamic = "force-dynamic";

export default async function UserEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const admin = await requireUser();
  if (admin.role !== "SUPER_ADMIN") redirect("/portfolio");
  const { id } = await params;
  const [edited, properties, query] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, title: true, role: true, active: true, allProperties: true, flatcloudMember: true, avatarMimeType: true, updatedAt: true, activity: { select: { lastSeenAt: true } }, memberships: true, unitMemberships: true, managedProperties: { select: { id: true, name: true } } } }),
    prisma.property.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { units: { orderBy: { label: "asc" } } } }),
    searchParams,
  ]);
  if (!edited) notFound();
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

  return <Shell user={admin}><FormPage title={`Uživatel: ${edited.name}`} description="Kontaktní profil a srozumitelné nastavení rozsahu i úrovně oprávnění." backHref="/uzivatele">
    <Flash ok={query.ok} error={query.error}/>
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

    {edited.active && edited.role !== "SUPER_ADMIN" && edited.id !== admin.id && <p><a className="secondary" href={`/uzivatele/${edited.id}/obnova-hesla`}>Obnovit heslo uživatele</a></p>}

    {edited.active && edited.id !== admin.id && <form action="/api/admin/user-preview" method="post"><input type="hidden" name="userId" value={edited.id}/><button className="secondary">Pohled uživatele</button></form>}
    <form className={styles.formStack} action={`/api/users/${edited.id}`} method="post" encType="multipart/form-data" data-testid="user-access-form">
      {locksLastAdmin && <><input type="hidden" name="role" value={edited.role}/><input type="hidden" name="active" value="on"/><input type="hidden" name="allProperties" value="on"/></>}

      <section className={`card ${styles.sectionCard}`}>
        <div className={styles.sectionHead}><div><h2>Profil uživatele</h2><p>Kontaktní údaje a fotografie nemění rozsah oprávnění.</p></div><span className={styles.sectionTag}>Profil</span></div>
        {locksLastAdmin && <div className="notice">Toto je poslední aktivní hlavní administrátor. Jeho roli ani aktivní stav nelze změnit, dokud nevytvoříte dalšího aktivního hlavního administrátora.</div>}
        <div className={styles.profileGrid}>
          <div className={styles.avatarRow}><UserAvatar user={edited} size="lg" className={online ? "user-online" : ""}/><div className={styles.avatarActions}><div><strong>Avatar uživatele</strong><p>PNG, JPG nebo WebP, maximálně 2 MB. Bez nahrané fotografie zůstávají iniciály.</p></div><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp"/><label className="checkbox-field"><input type="checkbox" name="removeAvatar"/><span>Odstranit současný avatar</span></label></div></div>
          <Field label="Jméno" name="name" defaultValue={edited.name} required/>
          <Field label="E-mail" name="email" defaultValue={edited.email} type="email" required/>
          <Field label="Telefon" name="phone" defaultValue={edited.phone}/>
          <Field label="Funkce / společnost" name="title" defaultValue={edited.title}/>
        </div>
      </section>

      <section className={`card ${styles.sectionCard}`}><h2>Příslušnost ke skupině</h2><p>Členství zpřístupní interní kontext FlatCloud pouze v rozsahu přidělených oprávnění. Vlastnictví ani správa nemovitosti členství neurčuje.</p><input type="hidden" name="membershipFieldPresent" value="1"/><label className="checkbox-field"><input type="checkbox" name="flatcloudMember" defaultChecked={edited.flatcloudMember || edited.role === "SUPER_ADMIN"} disabled={edited.role === "SUPER_ADMIN"}/><span>Uživatel patří do skupiny FlatCloud</span></label><p>Externí uživatel má čisté prostředí Flatberry. Hlavní administrátor má interní kontext vždy.</p></section>
      <section className={`card ${styles.sectionCard}`}>
        <div className={styles.sectionHead}><div><h2>Role a rozsah přístupu</h2><p>Nejprve určete globální roli a rozsah. Potom níže nastavte konkrétní úroveň pro jednotlivé objekty nebo jednotky.</p></div><span className={styles.sectionTag}>Oprávnění</span></div>
        <div className={styles.accessBasics}>
          <Select label="Globální role" name="role" defaultValue={edited.role} options={Object.entries(userRoles)} disabled={locksLastAdmin}/>
          <label className="checkbox-field"><input type="checkbox" name="active" defaultChecked={edited.active} disabled={locksLastAdmin}/><span>Uživatel je aktivní</span></label>
          <label className={`checkbox-field ${styles.fullRow}`}><input type="checkbox" name="allProperties" defaultChecked={globalScope} disabled={locksLastAdmin}/><span>Přístup ke všem současným i budoucím nemovitostem</span></label>
          <div className={styles.roleNote}><strong>Jak se rozsah vyhodnocuje:</strong> Generální správce a hlavní administrátor vždy vidí celé portfolio. U ostatních rolí volba „všechny nemovitosti“ přebije jednotlivé granty. Pokud ji vypnete, musí níže zůstat alespoň požadované objekty nebo jednotky.</div>
        </div>

        <div className={styles.permissionLegend} aria-label="Vysvětlení úrovní oprávnění">
          <div className={styles.legendItem}><strong>Čtení</strong><span>Zobrazí data, dokumenty a přehledy. Nic nemění.</span></div>
          <div className={styles.legendItem}><strong>Zápis</strong><span>Zobrazí a upravuje provozní data. Nemůže měnit přístupy ostatních.</span></div>
          <div className={styles.legendItem}><strong>Plná správa</strong><span>Nejvyšší oprávnění v přiděleném rozsahu; u objektu zahrnuje i správu uživatelů.</span></div>
        </div>

        <div className={styles.permissionSection}>
          <div className={styles.permissionSectionTitle}><div><h3>Celé nemovitosti</h3><p>Grant na objekt je vhodný pro správce nebo vlastníka, který má vidět celý dům. Jednotkové granty v takovém objektu už nejsou potřeba.</p></div><span className={styles.permissionCount}>{edited.memberships.length} aktuálně přiřazeno</span></div>
          <div className={styles.permissionTable}>
            {properties.length ? properties.map((property) => <div className={styles.permissionRow} key={property.id}>
              <div className={styles.permissionIdentity}><strong>{property.name}</strong><small>{property.address}, {property.city} · {property.units.length} jednotek</small></div>
              <PermissionLevelSelect name={`property:${property.id}`} defaultValue={membershipMap.get(property.id) || ""} ariaLabel={`Oprávnění pro nemovitost ${property.name}`}/>
            </div>) : <div className={styles.emptyState}>Nejsou založené žádné aktivní nemovitosti.</div>}
          </div>
        </div>

        <div className={styles.permissionSection}>
          <div className={styles.permissionSectionTitle}><div><h3>Pouze vybrané jednotky</h3><p>Použijte, když má uživatel vidět jen konkrétní byty nebo prostory. Přístup k celé nemovitosti výše má přednost.</p></div><span className={styles.permissionCount}>{edited.unitMemberships.length} aktuálně přiřazeno</span></div>
          <div>
            {properties.map((property) => {
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

        {edited.managedProperties.length > 0 && <div className="notice">Správce objektů: {edited.managedProperties.map((property) => property.name).join(", ")}</div>}
        <label className={styles.confirmBox}><input type="checkbox" name="confirmAccessChange"/><span><strong>Potvrzení změny přístupu</strong><span>Pokud měním roli, příslušnost ke skupině, aktivní stav nebo rozsah objektů/jednotek, potvrzuji dopad na přístup tohoto uživatele. Bez tohoto potvrzení server změnu oprávnění neuloží.</span></span></label>
      </section>

      <div className={styles.actions}><a className="secondary" href="/uzivatele">Zrušit</a><button className="primary" type="submit">Uložit změny uživatele</button></div>
    </form>
  </FormPage></Shell>;
}
