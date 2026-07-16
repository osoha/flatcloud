import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, FileText, Mail, Pencil, Phone, Plus, UserRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser, canSeeAll } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { money, date } from "@/lib/format";
import { currentPeriod } from "@/lib/period";
import { unitStatuses, unitTypes } from "@/lib/labels";

export const dynamic = "force-dynamic";
export default async function UnitDetail({ params, searchParams }: { params: Promise<{ id: string; unitId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, unitId } = await params;
  const [property, unit, query] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { ownerships: { include: { owner: true } }, leases: { orderBy: { startDate: "desc" }, include: { tenant: true, paymentItems: true, charges: { include: { allocations: true, items: true }, orderBy: { period: "desc" } } } } } }),
    searchParams,
  ]);
  if (!property || !unit) notFound();
  const membership = property.memberships.find((row) => row.userId === user.id);
  const canManage = canSeeAll(user.role) || membership?.permission === "EDIT" || membership?.permission === "ADMIN";
  const activeLease = unit.leases.find((lease) => lease.status === "ACTIVE") || unit.leases[0];
  const owner = unit.ownerships[0]?.owner || property.owner;
  const now = new Date();
  return <Shell user={user}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={`/nemovitosti/${id}/prehled`}>{property.name}</Link><span>›</span><Link href={`/nemovitosti/${id}/jednotky`}>Jednotky</Link><span>›</span><span>{unit.label}</span></div>
    <div className="unit-hero card"><div><span className="eyebrow">{unitTypes[unit.type]}</span><h1>{unit.label}</h1><p>{property.name} · {unit.floor || "podlaží neuvedeno"} · {unit.areaM2 ? `${unit.areaM2} m²` : "plocha neuvedena"}</p></div><div className="action-row">{canManage&&<Link className="secondary" href={`/nemovitosti/${id}/jednotky/${unit.id}/upravit`}><Pencil size={15}/> Upravit jednotku</Link>}{canManage&&<Link className="primary" href={`/nemovitosti/${id}/smlouvy/nova?unitId=${unit.id}`}><Plus size={15}/> Nová smlouva</Link>}</div></div>
    <Flash ok={query.ok} error={query.error}/>
    <div className="unit-kpi-grid"><div className="card mini-kpi"><span>Stav</span><strong>{unitStatuses[unit.status]}</strong></div><div className="card mini-kpi"><span>Vlastník</span><Link href={`/vlastnici/${owner.id}`}>{owner.name}</Link></div><div className="card mini-kpi"><span>Nájemník</span>{activeLease?<Link href={`/nemovitosti/${id}/najemnici/${activeLease.tenant.id}/upravit`}>{activeLease.tenant.name}</Link>:<strong>Volná jednotka</strong>}</div><div className="card mini-kpi"><span>Aktuální předpis</span><strong>{activeLease ? money(activeLease.paymentItems.filter(i=>i.active).reduce((s,i)=>s+i.amountCents,0)) : "—"}</strong></div></div>
    {activeLease ? <>
      <div className="detail-grid">
        <div className="card col-7"><div className="card-head"><div><h2>Předpisy jednotky</h2><p className="muted-copy">Předpisy jsou navázané na smlouvu a konkrétní bytovou jednotku.</p></div>{canManage&&<form action={`/api/properties/${id}/units/${unit.id}/charges/generate`} method="post" className="unit-charge-form"><input type="month" name="period" defaultValue={currentPeriod()} required/><button className="primary" type="submit">Vytvořit měsíc</button></form>}</div>
          <div className="table-wrap"><table><thead><tr><th>Období</th><th>Splatnost</th><th>Předpis</th><th>Uhrazeno</th><th>Saldo</th><th>Stav</th><th></th></tr></thead><tbody>{activeLease.charges.length?activeLease.charges.map((charge)=>{const paid=charge.allocations.reduce((s,a)=>s+a.amountCents,0);const balance=paid-charge.amountCents;const previousMonth=charge.dueDate.getUTCFullYear()<now.getUTCFullYear()||(charge.dueDate.getUTCFullYear()===now.getUTCFullYear()&&charge.dueDate.getUTCMonth()<now.getUTCMonth());const overdue=charge.active&&paid<charge.amountCents&&charge.dueDate<now;return <tr key={charge.id} className={!charge.active?"row-disabled":previousMonth&&overdue?"row-debt":overdue?"row-overdue":""}><td><Link className="entity-link" href={`/nemovitosti/${id}/predpisy/mesicni/${charge.id}`}>{charge.period}</Link></td><td>{date(charge.dueDate)}</td><td className="money">{money(charge.amountCents)}</td><td className="money">{money(paid)}</td><td className="money">{money(balance)}</td><td><span className={`status ${!charge.active?"":paid>=charge.amountCents?"ok":previousMonth?"bad":"warn"}`}>{!charge.active?"Vypnuto":paid>=charge.amountCents?"Uhrazeno":previousMonth?"Dluh":"Po splatnosti"}</span></td><td><Link className="table-link" href={`/nemovitosti/${id}/predpisy/mesicni/${charge.id}`}>Detail</Link></td></tr>}):<tr><td colSpan={7} className="table-empty">Zatím nebyly vytvořeny žádné měsíční předpisy.</td></tr>}</tbody></table></div>
        </div>
        <div className="card col-5"><div className="card-head"><h2>Aktivní smlouva</h2>{canManage&&<Link className="icon-link" href={`/nemovitosti/${id}/smlouvy/${activeLease.id}/upravit`}><Pencil size={15}/></Link>}</div><div className="summary-list"><div><span>Nájemník</span><Link className="entity-link" href={`/nemovitosti/${id}/najemnici/${activeLease.tenant.id}/upravit`}>{activeLease.tenant.name}</Link></div><div><span>Číslo smlouvy</span><Link className="entity-link" href={`/nemovitosti/${id}/smlouvy/${activeLease.id}/upravit`}>{activeLease.contractNumber||"Bez čísla"}</Link></div><div><span>Platnost</span><strong>{date(activeLease.startDate)} – {activeLease.endDate?date(activeLease.endDate):"neurčito"}</strong></div><div><span>Splatnost</span><strong>{activeLease.dueDay}. den · {activeLease.rentTiming==="ARREARS"?"zpětně":"dopředně"}</strong></div><div><span>Variabilní symbol</span><strong>{activeLease.variableSymbol}</strong></div></div>
          <div className="contact-lines"><a href={`mailto:${activeLease.tenant.email||""}`} className={!activeLease.tenant.email?"disabled-link":""}><Mail size={15}/>{activeLease.tenant.email||"E-mail neuveden"}</a><a href={`tel:${activeLease.tenant.phone||""}`} className={!activeLease.tenant.phone?"disabled-link":""}><Phone size={15}/>{activeLease.tenant.phone||"Telefon neuveden"}</a></div>
        </div>
      </div>
    </> : <div className="card empty-state"><UserRound size={28}/><h2>Jednotka nemá aktivní smlouvu</h2><p>Nejdříve přidejte nájemníka a nájemní smlouvu.</p></div>}
  </div></Shell>;
}
