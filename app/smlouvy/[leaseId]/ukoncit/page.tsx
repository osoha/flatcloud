import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { editableUnitWhere, leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Textarea } from "@/components/FormUi";
import { date, money } from "@/lib/format";
import { dateInput } from "@/lib/forms";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { outstandingCents } from "@/lib/charges";
import { securityDepositSnapshot } from "@/lib/security-deposit";
import { MethodologyCallout } from "@/components/MethodologyCallout";

export const dynamic = "force-dynamic";

export default async function TerminateLeasePage({ params, searchParams }: { params: Promise<{ leaseId: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { leaseId } = await params;
  const [lease, query] = await Promise.all([
    prisma.lease.findFirst({ where: { id: leaseId, ...leaseAccessWhere(user) }, include: { tenant: true, unit: { include: { property: true } }, charges: { where: { active: true }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true } }, securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] }, securityDepositMovements: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] }, rentChangeProposals: { where: { status: "CONFIRMED" } } } }),
    searchParams,
  ]);
  if (!lease) notFound();
  const canEdit = Boolean(await prisma.unit.findFirst({ where: { id: lease.unitId, ...editableUnitWhere(user, lease.unit.propertyId) }, select: { id: true } }));
  if (!canEdit) notFound();
  const lifecycle = leaseStatusAt(lease);
  if (lifecycle === "ENDED") notFound();
  const future = lifecycle === "FUTURE";
  const openCharges = lease.charges.filter((charge) => outstandingCents(charge) > 0);
  const outstanding = openCharges.reduce((sum, charge) => sum + outstandingCents(charge), 0);
  const deposit = securityDepositSnapshot(lease);

  return <Shell user={user} taskPropertyId={lease.unit.propertyId} taskLeaseId={lease.id}><FormPage title={future ? "Zrušit budoucí smlouvu" : "Ukončit nájemní vztah"} description={`${lease.tenant.name} · ${lease.unit.property.name} · ${lease.unit.label}`} backHref={`/smlouvy/${lease.id}`}>
    <Flash error={query.error}/>
    <MethodologyCallout slug="ukonceni-najmu" compact/>
    <div className="card lifecycle-preflight"><div><span>Otevřené předpisy</span><strong>{openCharges.length}</strong><small>{money(outstanding)} zbývá uhradit</small></div><div><span>Držená kauce</span><strong>{money(deposit.heldPrincipalCents)}</strong><small>{deposit.heldPrincipalCents > 0 ? "Po ukončení bude k vypořádání" : "Bez evidované jistiny"}</small></div><div><span>Budoucí změny nájmu (potvrzené)</span><strong>{lease.rentChangeProposals.length}</strong><small>Změny za zadaným koncem vztahu budou zrušeny</small></div></div>
    <div className="legal-warning"><strong>Co se po potvrzení stane</strong><span>Smlouva ani nájemník se nemažou. FlatCloud ukončí budoucí automatické předpisy, zachová účetní historii a podle data uvolní jednotku. Otevřené dluhy a pohyby kauce zůstanou k dořešení.</span></div>
    <FormCard action={`/api/properties/${lease.unit.propertyId}/leases/${lease.id}/terminate`} cancelHref={`/smlouvy/${lease.id}`} submitLabel={future ? "Potvrdit zrušení smlouvy" : "Potvrdit ukončení vztahu"}>
      {!future && <><Field label="Poslední den nájemního vztahu" name="terminatedOn" type="date" defaultValue={dateInput(new Date())} min={dateInput(lease.startDate)} max={dateInput(lease.endDate)} required/><p className="field muted-copy">Při dnešním datu zůstane vztah aktivní do konce dne a následující den se jednotka uvolní.</p></>}
      <Textarea label={future ? "Důvod zrušení" : "Důvod ukončení"} name="reason" required placeholder={future ? "Např. smlouva nenabyla účinnosti" : "Např. dohoda smluvních stran"}/>
      <label className="checkbox-field field-full"><input type="checkbox" name="confirmed" value="yes" required/><span>Ověřil/a jsem datum, otevřené předpisy a stav kauce. Rozumím, že historie zůstane zachována.</span></label>
    </FormCard>
    {(openCharges.length > 0 || deposit.heldPrincipalCents > 0) && <div className="card lifecycle-followup"><h2>Následné kroky</h2><p>Po ukončení pokračujte na detailu smlouvy: dořešte {openCharges.length ? <Link href={`/nemovitosti/${lease.unit.propertyId}/predpisy/${lease.id}`}>otevřené předpisy</Link> : "předpisy"} a {deposit.heldPrincipalCents > 0 ? <Link href={`/smlouvy/${lease.id}#kauce`}>vypořádání kauce</Link> : "kauci"}.</p><small>Začátek smlouvy: {date(lease.startDate)}{lease.endDate ? ` · smluvní konec: ${date(lease.endDate)}` : " · smlouva na dobu neurčitou"}</small></div>}
  </FormPage></Shell>;
}
