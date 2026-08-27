import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { date, money } from "@/lib/format";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseStatuses } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function LeaseDetail({ params }: { params: Promise<{ leaseId: string }> }) {
  const user = await requireUser();
  const { leaseId } = await params;
  const lease = await prisma.lease.findFirst({ where: { id: leaseId, ...leaseAccessWhere(user) }, include: { tenant: true, ownerBankAccount: true, occupants: { where: { active: true }, orderBy: { name: "asc" } }, unit: { include: { property: true } } } });
  if (!lease) notFound();
  const status = leaseStatusAt(lease);
  return <Shell user={user} taskPropertyId={lease.unit.propertyId} taskLeaseId={lease.id}><div className="page"><div className="breadcrumb"><Link href="/smlouvy">Smlouvy</Link><span>›</span><span>{lease.contractNumber || lease.tenant.name}</span></div><div className="page-title"><div><h1>{lease.contractNumber || "Smlouva"}</h1><p>{lease.tenant.name} · {lease.unit.property.name} · {lease.unit.label}</p></div><Link className="primary" href={`/nemovitosti/${lease.unit.propertyId}/smlouvy/${lease.id}/upravit`}>Upravit smlouvu</Link></div><div className="detail-grid"><div className="card col-6"><h2>Vztah a smlouva</h2><div className="summary-list"><div><span>Nájemník</span><strong><Link href={`/najemnici/${lease.tenantId}`}>{lease.tenant.name}</Link></strong></div><div><span>Nemovitost</span><strong><Link href={`/nemovitosti/${lease.unit.propertyId}/prehled`}>{lease.unit.property.name}</Link></strong></div><div><span>Jednotka</span><strong><Link href={`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unitId}`}>{lease.unit.label}</Link></strong></div><div><span>Stav</span><strong>{leaseStatuses[status]}</strong></div><div><span>Období</span><strong>{date(lease.startDate)} – {lease.endDate ? date(lease.endDate) : "neurčito"}</strong></div><div><span>Variabilní symbol</span><strong>{lease.variableSymbol}</strong></div></div></div><div className="card col-6"><h2>Finance</h2><div className="summary-list"><div><span>Nájemné</span><strong>{money(lease.rentCents)}</strong></div><div><span>Služby</span><strong>{money(lease.servicesCents)}</strong></div><div><span>Kauce</span><strong>{money(lease.depositCents)}</strong></div><div><span>Účet vlastníka</span><strong>{lease.ownerBankAccount?.iban || lease.ownerBankAccount?.accountNumber || "—"}</strong></div><div><span>Účet nájemníka</span><strong>{lease.tenantBankAccount || "—"}</strong></div><div><span>Automatické předpisy / indexace</span><strong>{lease.autoChargesEnabled ? "Ano" : "Ne"} / {lease.indexationEnabled ? "Ano" : "Ne"}</strong></div></div></div><div className="card col-12"><h2>Osoby v nájmu</h2>{lease.occupants.length ? <ul>{lease.occupants.map((occupant) => <li key={occupant.id}>{occupant.name}{occupant.email ? ` · ${occupant.email}` : ""}</li>)}</ul> : <p className="muted-copy">Nejsou evidováni další uživatelé jednotky.</p>}</div></div></div></Shell>;
}
