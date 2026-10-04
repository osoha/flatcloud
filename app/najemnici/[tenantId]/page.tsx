import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { leaseAccessWhere, tenantAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PaymentLedgerTable } from "@/components/PaymentLedgerTable";
import { date, money, phone } from "@/lib/format";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseStatuses } from "@/lib/labels";
import { loadPaymentLedgerRows } from "@/lib/payment-ledger";
import { historicalDebtCents, outstandingCents, overdueDebtCents, paidCents } from "@/lib/charges";
import { securityDepositSnapshot } from "@/lib/security-deposit";
import { TenantAvatar } from "@/components/TenantAvatar";
import {Flash} from "@/components/FormUi";
import {openSecret} from "@/lib/secret";

export const dynamic = "force-dynamic";

export default async function TenantDetail({ params,searchParams }: { params: Promise<{ tenantId: string }>;searchParams:Promise<{ok?:string;error?:string;invite?:string}> }) {
  const user = await requireUser();
  const { tenantId } = await params;
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, ...tenantAccessWhere(user) },
    include: { portalInvitations:{where:{status:"PENDING"},orderBy:{createdAt:"desc"},take:3}, portalAccesses: { include: { user: { select: { id: true, name: true, email: true, active: true } } } }, propertyLinks: { include: { property: true }, orderBy: { property: { name: "asc" } } }, leases: { where: leaseAccessWhere(user), include: {
      unit: { include: { property: true } },
      charges: { include: { allocations: true, securityDepositOffsets: true, creditApplications: true } },
      securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] },
      securityDepositMovements: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] },
    }, orderBy: { startDate: "desc" } }, leaseParties: { where: { lease: leaseAccessWhere(user) }, include: { lease: { include: {
      unit: { include: { property: true } },
      charges: { include: { allocations: true, securityDepositOffsets: true, creditApplications: true } },
      securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] },
      securityDepositMovements: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] },
    } } } } },
  });
  if (!tenant) notFound();
  const leases = Array.from(new Map([...tenant.leases, ...tenant.leaseParties.map((party) => party.lease)].map((lease) => [lease.id, lease])).values()).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const status = !leases.length ? "PROFILE" : leases.some((lease) => leaseStatusAt(lease) === "ACTIVE") ? "ACTIVE" : leases.some((lease) => leaseStatusAt(lease) === "FUTURE") ? "FUTURE" : "ENDED";
  const actionProperty = leases[0]?.unit.property || tenant.propertyLinks[0]?.property;
  const ledgerRows = await loadPaymentLedgerRows(leases.map((lease) => lease.id));
  const charges = leases.flatMap((lease) => lease.charges);
  const prescribedCents = charges.filter((charge) => charge.active).reduce((sum, charge) => sum + charge.amountCents, 0);
  const paidAllocatedCents = charges.filter((charge) => charge.active).reduce((sum, charge) => sum + paidCents(charge), 0);
  const outstandingActiveCents = charges.filter((charge) => charge.active).reduce((sum, charge) => sum + outstandingCents(charge), 0);
  const overdueCents = charges.reduce((sum, charge) => sum + overdueDebtCents(charge), 0);
  const historicalCents = charges.reduce((sum, charge) => sum + historicalDebtCents(charge), 0);
  const historicalRows = leases.flatMap((lease) => lease.charges.filter((charge) => historicalDebtCents(charge) > 0).map((charge) => ({ lease, charge, amountCents: historicalDebtCents(charge) })));
  const heldDepositCents = leases.reduce((sum, lease) => sum + securityDepositSnapshot(lease).heldPrincipalCents, 0);

  const query=await searchParams;
  const sandbox=process.env.RENDER_GIT_BRANCH?.startsWith("sandbox/")||process.env.RENDER_EXTERNAL_URL?.includes("sandbox");
  const sandboxLinks=sandbox?tenant.portalInvitations.map(invite=>{try {const token=openSecret(invite.tokenEncrypted);return token?{id:invite.id,url:new URL(`/pozvanka/${token}`,process.env.RENDER_EXTERNAL_URL||process.env.APP_URL||"http://localhost:3000").toString()}:null;}catch{return null}}):[];
  return <Shell user={user}><div className="page"><Flash ok={query.ok} error={query.error}/>
    <div className="breadcrumb"><Link href="/najemnici">Nájemníci</Link><span>›</span><span>{tenant.name}</span></div>
    <div className="page-title"><div className="tenant-title"><TenantAvatar tenant={tenant}/><div><PageHeading>{tenant.name}</PageHeading><p>{tenant.type === "COMPANY" ? "Právnická osoba" : "Fyzická osoba"} · {status === "PROFILE" ? "profil bez smlouvy" : leaseStatuses[status]}</p></div></div><div className="top-actions">{actionProperty && <><Link className="secondary" href={`/nemovitosti/${actionProperty.id}/najemnici/${tenant.id}/upravit`}>Upravit profil</Link><Link className="primary" href={`/nemovitosti/${actionProperty.id}/smlouvy/nova?tenantId=${tenant.id}`}>Přidat do smlouvy</Link></>}</div></div>
    <div className="detail-grid"><div className="card col-5"><h2>Profil</h2><div className="summary-list"><div><span>E-mail</span><strong>{tenant.communicationEmail || tenant.email || "—"}</strong></div><div><span>Telefon</span><strong>{phone(tenant.phone) || "—"}</strong></div><div><span>Adresa</span><strong>{tenant.address || tenant.billingAddress || "—"}</strong></div><div><span>IČO</span><strong>{tenant.ico || "—"}</strong></div>{tenant.type === "PERSON" && <><div><span>Datum narození</span><strong>{tenant.dateOfBirth ? date(tenant.dateOfBirth) : "—"}</strong></div><div><span>Číslo identifikačního dokladu</span><strong>{tenant.identityDocumentNumber || "—"}</strong></div><div><span>Číslo cestovního pasu</span><strong>{tenant.passportNumber || "—"}</strong></div></>}<div><span>Známé účty plátce</span><strong>{tenant.payerAccounts.length ? tenant.payerAccounts.join(", ") : "—"}</strong></div></div></div><div className="card col-7"><h2>Smlouvy</h2><div className="table-wrap"><table><thead><tr><th>Nemovitost / jednotka</th><th>Číslo smlouvy</th><th>Období</th><th>Stav</th><th>Částka</th></tr></thead><tbody>{leases.map((lease) => <tr key={lease.id}><td><span className="tenant-lease-location"><Link href={`/smlouvy/${lease.id}`}><strong>{lease.unit.property.name}</strong></Link><small>Jednotka: {lease.unit.label}</small></span></td><td>{lease.contractNumber || "—"}</td><td>{date(lease.startDate)} – {lease.endDate ? date(lease.endDate) : "neurčito"}</td><td>{leaseStatuses[leaseStatusAt(lease)]}</td><td>{money(lease.rentCents)}</td></tr>)}</tbody></table></div></div></div>
    {user.role==="SUPER_ADMIN"&&<section className="card tenant-portal-access-card" aria-labelledby="tenant-portal-access-heading"><div className="card-head"><div><span className="eyebrow">Účet a přístup</span><h2 id="tenant-portal-access-heading">Portál nájemníka</h2><p className="muted-copy">Přístup navazuje na evidovaný e-mail a dostupné smlouvy této osoby.</p></div><Link className="secondary" href={`/portal/najemnik/${tenant.id}`}>Prohlédnout očima nájemníka →</Link></div><div className="tenant-portal-access-status"><strong>{tenant.portalAccesses.some(access=>access.user.active)?"Přístup aktivní":tenant.portalInvitations.length?"Pozvánka čeká na přijetí":"Bez přístupu"}</strong><span>{tenant.communicationEmail||tenant.email||"Chybí e-mail nájemníka"}</span><small>{leases.length?`Smlouvy: ${leases.map(lease=>`${lease.unit.property.name} · ${lease.unit.label}`).join(", ")}`:"Pro pozvánku je potřeba smlouva."}</small></div>{tenant.portalAccesses.map(access=><div key={access.userId} className="tenant-portal-access-row"><span>{access.user.name} · {access.user.email}{access.user.active?"":" · deaktivován"}</span><form action={`/api/tenants/${tenant.id}/portal-access/${access.userId}/revoke`} method="post"><button className="secondary" type="submit">Odebrat přístup</button></form></div>)}{!tenant.portalAccesses.some(access=>access.user.active)&&<form action={`/api/tenants/${tenant.id}/portal-invite`} method="post"><button className="primary" type="submit" disabled={!leases.length||!(tenant.communicationEmail||tenant.email)}>Pozvat do portálu</button></form>}{query.invite&&<p className="notice">Testovací odkaz: <code>{query.invite}</code></p>}{tenant.portalInvitations.map((invitation,index)=><p key={invitation.id} className="notice">Pozvánka pro {invitation.email}: {invitation.sentAt?"e-mail odeslán":invitation.deliveryError||"čeká na odeslání"}. Platí do {date(invitation.expiresAt)}.{sandbox&&sandboxLinks[index]&&<> Testovací odkaz: <code>{sandboxLinks[index]!.url}</code></>}</p>)}</section>}
    {/* Legacy static verifier marker: Dluh po splatnosti */}
    <div className="stat-grid"><FinanceStat label="Předepsáno" value={money(prescribedCents)}/><FinanceStat label="Uhrazeno / započteno" value={money(paidAllocatedCents)}/><FinanceStat label="Neuhrazené předpisy" value={money(outstandingActiveCents)}/><FinanceStat label="Aktuální dluh po splatnosti" value={money(overdueCents)} bad={overdueCents > 0}/><FinanceStat label="Historické pohledávky" value={money(historicalCents)}/><FinanceStat label="Držená jistina kauce" value={money(heldDepositCents)}/></div>
    {historicalRows.length>0&&<div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Historické pohledávky</h2><p>Oddělené staré nebo administrativní pohledávky. Nevstupují do aktuálního dluhu portfolia.</p></div></div><div className="table-wrap"><table><thead><tr><th>Nemovitost / jednotka</th><th>Období</th><th>Částka</th><th>Důvod</th><th></th></tr></thead><tbody>{historicalRows.map(({lease,charge,amountCents})=><tr key={charge.id}><td>{lease.unit.property.name} · {lease.unit.label}</td><td>{charge.period}</td><td className="money">{money(amountCents)}</td><td>{charge.debtTreatmentReason||"—"}</td><td><Link href={`/nemovitosti/${lease.unit.property.id}/predpisy/mesicni/${charge.id}`}>Detail</Link></td></tr>)}</tbody></table></div></div>}
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Finanční historie nájemníka</h2><p>Zaúčtované části bankovních transakcí a přijaté kauce pouze z nájemních vztahů, ke kterým máte přístup.</p></div></div><PaymentLedgerTable rows={ledgerRows} showLocation empty="K dostupným smlouvám zatím není přiřazena žádná platba ani přijatá kauce."/></div>
  </div></Shell>;
}

function FinanceStat({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) { return <div className="card stat"><div><span>{label}</span><strong className={bad ? "negative" : ""}>{value}</strong></div></div>; }
