import Link from "next/link";
import { AlertCircle, Building2, CalendarCheck2, CheckCircle2, ClipboardCheck, ListChecks, WalletCards } from "lucide-react";
import { requireUser, canSeeAll, hasAllPropertyAccess } from "@/lib/auth";
import { accessibleProperties } from "@/lib/access";
import { money, date } from "@/lib/format";
import { currentPeriod } from "@/lib/period";
import { overdueDebtCents } from "@/lib/charges";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { leaseAlertsForProperties } from "@/lib/lease-alerts";
import { complianceState, openTaskStatuses } from "@/lib/operations";
import { taskCategories } from "@/lib/labels";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Portfolio({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const [properties, query] = await Promise.all([accessibleProperties(user), searchParams]);
  const period = currentPeriod();
  const fullAccess = hasAllPropertyAccess(user);
  const propertyIds = properties.map((property)=>property.id);
  const propertyWideIds = fullAccess ? propertyIds : properties.filter((property)=>property.memberships.some((m)=>m.userId===user.id)).map((property)=>property.id);
  const visibleUnitIds = properties.flatMap((property)=>property.units.map((unit)=>unit.id));
  const taskScope = fullAccess ? {} : { OR: [{ propertyId: { in: propertyWideIds } }, { unitId: { in: visibleUnitIds } }] };
  const revisionScope = fullAccess ? { propertyId: { in: propertyIds } } : { propertyId: { in: propertyWideIds } };
  const revisionHorizon = new Date(Date.now()+60*86_400_000);

  const [tasks, revisions] = await Promise.all([
    prisma.task.findMany({ where: { ...taskScope, status: { in: openTaskStatuses } }, include: { property: true, assignee: true }, orderBy: [{ priority:"desc" },{ dueAt:"asc" },{ updatedAt:"desc" }], take:30 }),
    prisma.complianceItem.findMany({ where: { ...revisionScope, active:true, nextDueAt:{lte:revisionHorizon} }, include:{property:true}, orderBy:{nextDueAt:"asc"}, take:30 }),
  ]);

  const rows = properties.map((property) => {
    let expected = 0, paid = 0, debt = 0;
    const paymentLinks = property.paymentAccounts;
    for (const unit of property.units) {
      for (const lease of unit.leases) {
        for (const charge of lease.charges) {
          if (charge.period === period && charge.active) { expected += charge.amountCents; paid += charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0); }
          debt += overdueDebtCents(charge);
        }
      }
    }
    const bankVerifiedCount = paymentLinks.filter((link)=>Boolean(link.notificationVerifiedAt)).length;
    return { property, expected, paid, debt, rate: expected ? Math.round(paid / expected * 100) : 100, bankVerified:paymentLinks.length > 0 && bankVerifiedCount === paymentLinks.length, bankVerifiedCount, bankAccounts:paymentLinks.length };
  });
  const expected = rows.reduce((sum, row) => sum + row.expected, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  const debt = rows.reduce((sum, row) => sum + row.debt, 0);
  const contractAlerts = leaseAlertsForProperties(properties);
  const expiryCount = contractAlerts.filter((row) => row.kind === "EXPIRY").length;
  const anniversaryCount = contractAlerts.filter((row) => row.kind === "ANNIVERSARY").length;
  const unmatchedCount = user.role === "SUPER_ADMIN" ? (await Promise.all([
    prisma.bankTransaction.count({ where: { amountCents: { gt: 0 }, status: { in: ["UNMATCHED", "SUGGESTED"] } } }),
    prisma.inboxPayment.count({ where: { status: { in: ["RECEIVED", "UNMATCHED", "ERROR"] } } }),
  ])).reduce((sum, value) => sum + value, 0) : 0;
  const overdueRevisions=revisions.filter((r)=>complianceState(r).key==="overdue");

  const attention: {title:string;detail:string;href:string;tone:"bad"|"warn"|"info"}[]=[];
  if(debt>0)attention.push({title:`Dluh po splatnosti ${money(debt)}`,detail:"Otevřít portfolio dlužníků",href:"/reporty/saldo",tone:"bad"});
  if(unmatchedCount>0)attention.push({title:`${unmatchedCount} nespárovaných plateb`,detail:"Platby čekají na kontrolu",href:"/platby/nesparovane",tone:"warn"});
  for(const task of tasks.slice(0,4))attention.push({title:task.title,detail:`${task.property.name} · ${taskCategories[task.category]} · ${task.assignee?.name||"bez odpovědného"}`,href:`/ukoly/${task.id}`,tone:task.priority==="URGENT"?"bad":"warn"});
  for(const item of revisions.slice(0,3))attention.push({title:item.name,detail:`${item.property.name} · ${date(item.nextDueAt)} · ${complianceState(item).label}`,href:`/nemovitosti/${item.propertyId}/provoz#revize`,tone:complianceState(item).key==="overdue"?"bad":"warn"});
  for(const alert of contractAlerts.slice(0,3))attention.push({title:`${alert.kind==="EXPIRY"?"Expirace":"Výročí"} · ${alert.lease.unit.label}`,detail:`${alert.property.name} · ${alert.lease.tenant.name} · ${date(alert.date)}`,href:`/nemovitosti/${alert.property.id}/smlouvy/${alert.lease.id}/upravit`,tone:"info"});

  return <Shell user={user}><div className="page v21-portfolio"><div className="page-title"><div><h1>Portfolio</h1><p>Co vyžaduje pozornost napříč dostupnými nemovitostmi · období {period}.</p></div>{canSeeAll(user.role)&&<Link className="primary" href="/nemovitosti/nova">Přidat nemovitost</Link>}</div><Flash ok={query.ok} error={query.error}/>
    <div className="stat-grid v21-stat-grid"><Kpi href="/reporty/inkaso" icon={<CheckCircle2/>} label="Inkaso" value={`${expected?Math.round(paid/expected*100):100} %`} note={`${money(paid)} z ${money(expected)}`} tone="green"/><Kpi href="/reporty/saldo" icon={<WalletCards/>} label="Dluh" value={money(debt)} note="po splatnosti" tone="red" bad={debt>0}/><Kpi href="/ukoly" icon={<ListChecks/>} label="Úkoly" value={String(tasks.length)} note="otevřených případů" tone="orange" bad={tasks.some(t=>t.priority==="URGENT")}/><Kpi href="/revize" icon={<ClipboardCheck/>} label="Revize" value={String(revisions.length)} note={`${overdueRevisions.length} po termínu`} tone="purple" bad={overdueRevisions.length>0}/><Kpi href="/smlouvy/upozorneni" icon={<CalendarCheck2/>} label="Smlouvy" value={String(contractAlerts.length)} note={`${expiryCount} expirace · ${anniversaryCount} výročí`} tone="blue"/>{user.role==="SUPER_ADMIN"&&<Kpi href="/platby/nesparovane" icon={<AlertCircle/>} label="Nespárované" value={String(unmatchedCount)} note="plateb k řešení" tone="red" bad={unmatchedCount>0}/>}</div>
    <div className="detail-grid v21-dashboard-grid"><div className="card col-8 attention-card"><div className="card-head"><div><h2>Vyžaduje pozornost</h2><p className="muted-copy">Úkoly, finance, smlouvy a technické termíny v jedné pracovní frontě.</p></div></div><div className="attention-list">{attention.length?attention.slice(0,10).map((item,index)=><Link className={`attention-item ${item.tone}`} href={item.href} key={`${item.href}-${index}`}><span className="attention-icon"><AlertCircle size={17}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><b>→</b></Link>):<div className="calm-state"><CheckCircle2 size={22}/><div><strong>Portfolio je bez akutních událostí</strong><span>Žádná položka právě nevyžaduje okamžitý zásah.</span></div></div>}</div></div><div className="card col-4"><h2>Stav portfolia</h2><div className="summary-list"><div><span>Nemovitosti</span><strong>{rows.length}</strong></div><div><span>Otevřené úkoly</span><strong>{tasks.length}</strong></div><div><span>Revize do 60 dní</span><strong>{revisions.length}</strong></div><div><span>Expirace smluv</span><strong>{expiryCount}</strong></div><div><span>Výročí smluv</span><strong>{anniversaryCount}</strong></div><div><span>Bankovní e-mail ověřen</span><strong>{rows.filter(r=>r.bankVerified).length} / {rows.length}</strong></div></div></div></div>
    <div className="card portfolio-table-card" id="nemovitosti"><div className="table-toolbar"><div><h2>Nemovitosti</h2><p>Kliknutím otevřete provozní dashboard objektu.</p></div></div><div className="table-wrap"><table><thead><tr><th>Nemovitost</th><th>Vlastník / SPV</th><th>Bankovní e-mail</th><th>Předpis</th><th>Dluh</th><th>Inkaso</th><th>Stav</th></tr></thead><tbody>{rows.length?rows.map(({property,expected:propertyExpected,debt:propertyDebt,rate,bankVerified,bankVerifiedCount,bankAccounts})=><tr className="property-row" key={property.id}><td><Link className="property-cell" href={`/nemovitosti/${property.id}/prehled`}><div className="property-thumb"><Building2 size={18}/></div><div><strong>{property.name}</strong><small>{property.address}, {property.city}</small></div></Link></td><td><span className="owner-label">{property.ownerships.length?property.ownerships.map(o=>o.owner.name).join(", "):property.owner.name}</span></td><td><span className={`status ${bankVerified?"ok":"warn"}`}>{bankVerified?"Ověřeno":bankAccounts?`${bankVerifiedCount}/${bankAccounts} ověřeno`:"Bez účtu"}</span></td><td className="money">{money(propertyExpected)}</td><td className={propertyDebt?"money negative":"money positive"}>{money(propertyDebt)}</td><td><div className="collection-top"><span>{rate}%</span></div><div className={`progress ${rate<85?"bad":rate<95?"warn":""}`}><i style={{width:`${Math.min(rate,100)}%`}}/></div></td><td><span className={`status ${propertyDebt?"bad":rate>=100?"ok":"warn"}`}>{propertyDebt?"Vyžaduje pozornost":rate>=100?"V pořádku":"Rozpracováno"}</span></td></tr>):<tr><td colSpan={7} className="table-empty">Zatím nejsou evidované nemovitosti.</td></tr>}</tbody></table></div></div>
  </div></Shell>;
}
function Kpi({href,icon,label,value,note,tone,bad=false}:{href:string;icon:React.ReactNode;label:string;value:string;note:string;tone:string;bad?:boolean}){return <Link className="card stat stat-link" href={href}><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong className={bad?"negative":""}>{value}</strong><small className={bad?"bad":tone==="green"?"good":""}>{note}</small></div><b className="stat-arrow">→</b></Link>}
