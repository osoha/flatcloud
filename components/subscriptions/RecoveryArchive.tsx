import { prisma } from "@/lib/db";
import { editableUnitWhere } from "@/lib/access";
import type { SubscriptionSummary, SubscriptionUserContext } from "@/lib/subscriptions/types";
import styles from "./subscriptions.module.css";

export async function RecoveryArchive({ user, summary }: { user: SubscriptionUserContext; summary: SubscriptionSummary }) {
  if (!summary.accountId || !summary.overCapacity) return null;
  const wholeProperties = summary.scopes.filter(scope => !scope.unitId).map(scope => scope.propertyId);
  const unitIds = summary.scopes.flatMap(scope => scope.unitId ? [scope.unitId] : []);
  const [units, properties] = await Promise.all([
    prisma.unit.findMany({ where: { AND: [editableUnitWhere(user), { status: { not: "INACTIVE" }, operationalStatus: { not: "INACTIVE" }, OR: [{ id: { in: unitIds } }, { propertyId: { in: wholeProperties } }] }] }, select: { id: true, label: true, property: { select: { name: true } } }, orderBy: { label: "asc" } }),
    prisma.property.findMany({ where: { id: { in: wholeProperties }, active: true, ...(["SUPER_ADMIN", "MANAGER"].includes(user.role) ? {} : { memberships: { some: { userId: user.id, permission: { in: ["EDIT", "ADMIN"] } } } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!units.length && !properties.length) return null;
  return <details className={styles.details}><summary>Zmenšit aktivní portfolio archivací</summary><p className={styles.help}>Pokud se chcete vrátit do limitu Free, můžete archivovat nepotřebný objekt nebo jednotku. Historie a dokumenty zůstanou uložené. Archivovaná nemovitost se přestane započítávat do aktivní kapacity.</p>
    <div className={styles.twoCols}>
      {units.length > 0 && <ArchiveForm accountId={summary.accountId} entityType="unit" title="Jednotka k archivaci" options={units.map(unit => [unit.id, `${unit.property.name} · ${unit.label}`])}/>}
      {properties.length > 0 && <ArchiveForm accountId={summary.accountId} entityType="property" title="Objekt k archivaci" options={properties.map(property => [property.id, property.name])}/>}
    </div>
  </details>;
}

function ArchiveForm({ accountId, entityType, title, options }: { accountId: string; entityType: "unit" | "property"; title: string; options: [string, string][] }) {
  return <form className={styles.form} action="/api/subscriptions/archive" method="post"><input type="hidden" name="accountId" value={accountId}/><input type="hidden" name="entityType" value={entityType}/><input type="hidden" name="returnTo" value="/ucet/predplatne"/><label className="field"><span>{title}</span><select name="entityId" required><option value="">Vyberte…</option>{options.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label className="checkbox-field"><input name="confirmArchive" type="checkbox" required/><span>Potvrzuji archivaci vybrané nemovitosti.</span></label><button type="submit" className="secondary">Archivovat a přepočítat kapacitu</button></form>;
}
