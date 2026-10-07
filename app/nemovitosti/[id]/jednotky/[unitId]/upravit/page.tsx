import { availableOwners, unitReadScope } from "@/lib/bank-account-permissions";
import { hasPropertyPermission } from "@/lib/management";
import { OwnershipTransferFields } from "@/components/OwnershipTransferFields";
import { OwnershipHistory } from "@/components/OwnershipHistory";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canSeeAll } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";
import { unitDispositions, unitOperationalStatuses, unitTypes } from "@/lib/labels";
import { UnitOwnerFields } from "@/components/UnitOwnerFields";
import { ownerBankAccountLabel } from "@/lib/owner-bank-account";

export const dynamic = "force-dynamic";
export default async function EditUnit({ params, searchParams }: { params: Promise<{ id: string; unitId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, unitId } = await params;
  const [property, unit, owners, query] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.unit.findFirst({ where: { id: unitId, propertyId: id, ...unitReadScope(user) }, include: { ownerships: { include: { owner: true, ownerBankAccount: true }, orderBy: { createdAt: "asc" } } } }),
    availableOwners(user),
    searchParams,
  ]);
  if (!property || !unit) notFound();
  const membership = property.memberships.find((row) => row.userId === user.id);
  const canManage = canSeeAll(user.role) || membership?.permission === "EDIT" || membership?.permission === "ADMIN";
  if (!canManage) redirect(`/nemovitosti/${id}/jednotky/${unitId}`);
  const currentOwner = unit.ownerships[0]?.ownerId || property.ownerId;
  const currentAccount = unit.ownerships[0]?.ownerBankAccountId;
  const ownerOptions = owners.map((owner) => ({ id: owner.id, label: `${owner.name}${owner.ico ? ` · IČO ${owner.ico}` : ""}`, accounts: owner.paymentAccounts.map((account) => ({ id: account.id, label: ownerBankAccountLabel(account) })) }));
  return <Shell user={user} taskPropertyId={id}><FormPage title={`Upravit jednotku ${unit.label}`} description={property.name} backHref={`/nemovitosti/${id}/jednotky/${unit.id}`}>
    <Flash ok={query.ok} error={query.error}/>
    <FormCard action={`/api/properties/${id}/units/${unit.id}`} cancelHref={`/nemovitosti/${id}/jednotky/${unit.id}`}>
      <Field label="Označení jednotky" name="label" defaultValue={unit.label} required/>
      <Field label="Podlaží" name="floor" defaultValue={unit.floor}/>
      <Select label="Typ jednotky" name="type" defaultValue={unit.type} options={Object.entries(unitTypes)}/>
      <Select label="Dispozice pro MF benchmark" name="disposition" defaultValue={unit.disposition || ""} options={[["", "Nevyplněno"], ...Object.entries(unitDispositions)]}/>
      <Field label="Vlastní označení dispozice" name="dispositionCustom" defaultValue={unit.dispositionCustom} placeholder="Pouze pro Jiná dispozice"/>
      <Select label="Provozní režim" name="operationalStatus" defaultValue={unit.operationalStatus} options={Object.entries(unitOperationalStatuses)}/><div className="field field-full notice"><strong>Obsazenost se počítá automaticky</strong><span>Volná / Obsazená je dána smlouvou platnou k dnešnímu dni. Zde se eviduje pouze provozní režim jednotky.</span></div>
      <Field label="Plocha v m²" name="areaM2" type="number" step="0.01" min={0} defaultValue={unit.areaM2}/>
      <Textarea label="Poznámka" name="note" defaultValue={unit.note}/>
    </FormCard>
    <div className="card ownership-simple-card">
      <div className="card-head"><div><h2>Vlastník jednotky</h2><p className="muted-copy">Převod zachová historii. Příjemce plateb potvrďte samostatně; dosavadní účty smluv zůstanou při převodu zachovány.</p></div></div>
      <form className="owner-replace-form" action={`/api/properties/${id}/units/${unit.id}/ownerships`} method="post">
        <label className="field"><span>Nový vlastník</span><select name="ownerId" defaultValue="" required><option value="">Vyberte nového vlastníka</option>{ownerOptions.filter(o=>o.id!==currentOwner).map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label><OwnershipTransferFields currentOwnerId={currentOwner}/>
        <input type="hidden" name="replace" value="true"/>
      </form>
      <Link className="table-link inline-profile-link" href={`/vlastnici/${currentOwner}`}>Otevřít profil vlastníka →</Link>
    </div>
    <div className="card" id="prijemce-plateb"><h2>Příjemce plateb</h2><p>Samostatné potvrzení mění účet pro nové smlouvy a dosud neskončené smlouvy jednotky. Již uložené doklady ani platební záznamy se nepřepisují.</p><Link className="primary" href={`/bankovni-ucty?unitId=${unitId}`}>Změnit účet pro nájemné a oznámit nájemníkům</Link></div>
    <OwnershipHistory propertyId={id} unitId={unitId}/>
  </FormPage></Shell>;
}
