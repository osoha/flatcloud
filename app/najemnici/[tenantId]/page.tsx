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
import { outstandingCents, overdueDebtCents, paidCents } from "@/lib/charges";
import { securityDepositSnapshot } from "@/lib/security-deposit";

export const dynamic = "force-dynamic";

export default async function TenantDetail({ params }: { params: Promise<{ tenantId: string }> }) {
  const user = await requireUser();
  const { tenantId } = await params;
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, ...tenantAccessWhere(user) },
    include: { leases: { where: leaseAccessWhere(user), include: {
      unit: { include: { property: true } },
      charges: { include: { allocations: true, securityDepositOffsets: true, creditApplications: true } },
      securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] },
      securityDepositMovements: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] },
    }, orderBy: { startDate: "desc" } }, leaseParties: { where: { role: "CONTRACTING_PARTY", lease: leaseAccessWhere(user) }, include: { lease: { include: {
      unit: { include: { property: true } },
      charges: { include: { allocations: true, securityDepositOffsets: true, creditApplications: true } },
      securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] },
      securityDepositMovements: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] },
    } } } } },
  });
  if (!tenant) notFound();
  const leases = Array.from(new Map([...tenant.leases, ...tenant.leaseParties.map((party) => party.lease)].map((lease) => [lease.id, lease])).values()).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const status = leases.some((lease) => leaseStatusAt(lease) === "ACTIVE") ? "ACTIVE" : leases.some((lease) => leaseStatusAt(lease) === "FUTURE") ? "FUTURE" : "ENDED";
  const ledgerRows = await loadPaymentLedgerRows(leases.map((lease) => lease.id));
  const charges = leases.flatMap((lease) => lease.charges);
  const prescribedCents = charges.filter((charge) => charge.active).reduce((sum, charge) => sum + charge.amountCents, 0);
  const paidAllocatedCents = charges.filter((charge) => charge.active).reduce((sum, charge) => sum + paidCents(charge), 0);
  const outstandingActiveCents = charges.filter((charge) => charge.active).reduce((sum, charge) => sum + outstandingCents(charge), 0);
  const overdueCents = charges.reduce((sum, charge) => sum + overdueDebtCents(charge), 0);
  const heldDepositCents = leases.reduce((sum, lease) => sum + securityDepositSnapshot(lease).heldPrincipalCents, 0);

  return <Shell user={user}><div className="page">
    <div className="breadcrumb"><Link href="/najemnici">Nájemníci</Link><span>›</span><span>{tenant.name}</span></div>
    <div className="page-title"><div><h1>{tenant.name}</h1><p>{tenant.type === "COMPANY" ? "Právnická osoba" : "Fyzická osoba"} · {leaseStatuses[status]}</p></div><div className="top-actions">{leases[0] && <><Link className="secondary" href={`/nemovitosti/${leases[0].unit.propertyId}/najemnici/${tenant.id}/upravit`}>Upravit profil</Link><Link className="primary" href={`/nemovitosti/${leases[0].unit.propertyId}/smlouvy/nova?tenantId=${tenant.id}`}>Nová smlouva</Link></>}</div></div>
    <div className="detail-grid"><div className="card col-5"><h2>Profil</h2><div className="summary-list"><div><span>E-mail</span><strong>{tenant.communicationEmail || tenant.email || "—"}</strong></div><div><span>Telefon</span><strong>{phone(tenant.phone) || "—"}</strong></div><div><span>Adresa</span><strong>{tenant.address || tenant.billingAddress || "—"}</strong></div><div><span>IČO</span><strong>{tenant.ico || "—"}</strong></div><div><span>Známé účty plátce</span><strong>{tenant.payerAccounts.length ? tenant.payerAccounts.join(", ") : "—"}</strong></div></div></div><div className="card col-7"><h2>Smlouvy</h2><div className="table-wrap"><table><thead><tr><th>Nemovitost / jednotka</th><th>Číslo smlouvy</th><th>Období</th><th>Stav</th><th>Částka</th></tr></thead><tbody>{leases.map((lease) => <tr key={lease.id}><td><Link href={`/smlouvy/${lease.id}`}><strong>{lease.unit.property.name}</strong></Link><small>{lease.unit.label}</small></td><td>{lease.contractNumber || "—"}</td><td>{date(lease.startDate)} – {lease.endDate ? date(lease.endDate) : "neurčito"}</td><td>{leaseStatuses[leaseStatusAt(lease)]}</td><td>{money(lease.rentCents)}</td></tr>)}</tbody></table></div></div></div>
    <div className="stat-grid"><FinanceStat label="Předepsáno" value={money(prescribedCents)}/><FinanceStat label="Uhrazeno / započteno" value={money(paidAllocatedCents)}/><FinanceStat label="Neuhrazené předpisy" value={money(outstandingActiveCents)}/><FinanceStat label="Dluh po splatnosti" value={money(overdueCents)} bad={overdueCents > 0}/><FinanceStat label="Držená jistina kauce" value={money(heldDepositCents)}/></div>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Finanční historie nájemníka</h2><p>Zaúčtované části bankovních transakcí a přijaté kauce pouze z nájemních vztahů, ke kterým máte přístup.</p></div></div><PaymentLedgerTable rows={ledgerRows} showLocation empty="K dostupným smlouvám zatím není přiřazena žádná platba ani přijatá kauce."/></div>
  </div></Shell>;
}

function FinanceStat({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) { return <div className="card stat"><div><span>{label}</span><strong className={bad ? "negative" : ""}>{value}</strong></div></div>; }
