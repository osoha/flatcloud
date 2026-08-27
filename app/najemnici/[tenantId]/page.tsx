import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { tenantAccessWhere } from "@/lib/access";
import { leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { date } from "@/lib/format";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseStatuses } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function TenantDetail({ params }: { params: Promise<{ tenantId: string }> }) {
  const user = await requireUser();
  const { tenantId } = await params;
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, ...tenantAccessWhere(user) }, include: { leases: { where: leaseAccessWhere(user), include: { unit: { include: { property: true } } }, orderBy: { startDate: "desc" } } } });
  if (!tenant) notFound();
  const status = tenant.leases.some((lease) => leaseStatusAt(lease) === "ACTIVE") ? "ACTIVE" : tenant.leases.some((lease) => leaseStatusAt(lease) === "FUTURE") ? "FUTURE" : "ENDED";
  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href="/najemnici">Nájemníci</Link><span>›</span><span>{tenant.name}</span></div><div className="page-title"><div><h1>{tenant.name}</h1><p>{tenant.type === "COMPANY" ? "Právnická osoba" : "Fyzická osoba"} · {leaseStatuses[status]}</p></div><div className="top-actions"><Link className="secondary" href={`/nemovitosti/${tenant.leases[0]?.unit.propertyId || ""}/najemnici/${tenant.id}/upravit`}>Upravit profil</Link>{tenant.leases[0] && <Link className="primary" href={`/nemovitosti/${tenant.leases[0].unit.propertyId}/smlouvy/nova?tenantId=${tenant.id}`}>Nová smlouva</Link>}</div></div><div className="detail-grid"><div className="card col-5"><h2>Profil</h2><div className="summary-list"><div><span>E-mail</span><strong>{tenant.communicationEmail || tenant.email || "—"}</strong></div><div><span>Telefon</span><strong>{tenant.phone || "—"}</strong></div><div><span>Adresa</span><strong>{tenant.address || tenant.billingAddress || "—"}</strong></div><div><span>IČO</span><strong>{tenant.ico || "—"}</strong></div><div><span>Účty plátce</span><strong>{tenant.payerAccounts.length ? tenant.payerAccounts.join(", ") : "—"}</strong></div></div></div><div className="card col-7"><h2>Smlouvy</h2><div className="table-wrap"><table><thead><tr><th>Nemovitost / jednotka</th><th>Číslo smlouvy</th><th>Období</th><th>Stav</th><th>Částka</th></tr></thead><tbody>{tenant.leases.map((lease) => <tr key={lease.id}><td><Link href={`/smlouvy/${lease.id}`}><strong>{lease.unit.property.name}</strong></Link><small>{lease.unit.label}</small></td><td>{lease.contractNumber || "—"}</td><td>{date(lease.startDate)} – {lease.endDate ? date(lease.endDate) : "neurčito"}</td><td>{leaseStatuses[leaseStatusAt(lease)]}</td><td>{new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(lease.rentCents / 100)}</td></tr>)}</tbody></table></div></div></div></div></Shell>;
}
