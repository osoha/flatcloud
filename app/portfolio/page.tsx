import Link from "next/link";
import { AlertCircle, CalendarCheck2, CheckCircle2, ClipboardCheck, ListChecks, WalletCards } from "lucide-react";
import { PropertyIcon } from "@/components/PropertyIcon";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { accessibleProperties } from "@/lib/access";
import { money, date } from "@/lib/format";
import { currentPeriod } from "@/lib/period";
import { overdueDebtCents, paidCents } from "@/lib/charges";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { leaseAlertsForProperties } from "@/lib/lease-alerts";
import { complianceState, openTaskStatuses } from "@/lib/operations";
import { taskCategories } from "@/lib/labels";
import { prisma } from "@/lib/db";
import { bankVerificationCoverage } from "@/lib/bank-verification-scope";
import { PortfolioScopePicker } from "@/components/PortfolioScopePicker";
import { parsePortfolioSelection, portfolioSelectionLabel, selectedPropertyIds, serializePortfolioSelection } from "@/lib/portfolio-selection";

export const dynamic = "force-dynamic";

export default async function Portfolio({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; properties?: string; propertyId?: string }> }) {
  const user = await requireUser();
  const [availableProperties, query] = await Promise.all([accessibleProperties(user, { includeInactive: true }), searchParams]);
  const selection = parsePortfolioSelection(query);
  const allowedSelection = selectedPropertyIds(selection, availableProperties.map((property)=>property.id));
  const selectedSet = new Set(allowedSelection);
  const properties = availableProperties.filter((property)=>selectedSet.has(property.id));
  const selectionValue = serializePortfolioSelection(selection);
  const scopeQuery = selectionValue === null ? "" : `&properties=${encodeURIComponent(allowedSelection.join(","))}`;
  const activeProperties = properties.filter((property) => property.active);
  const period = currentPeriod();
  const fullAccess = hasAllPropertyAccess(user);
  const propertyIds = activeProperties.map((property)=>property.id);
  const propertyWideIds = fullAccess ? propertyIds : activeProperties.filter((property)=>property.memberships.some((m)=>m.userId===user.id)).map((property)=>property.id);
  const visibleUnitIds = activeProperties.flatMap((property)=>property.units.map((unit)=>unit.id));
  const taskScope = fullAccess ? { propertyId: { in: propertyIds } } : { OR: [{ propertyId: { in: propertyWideIds } }, { unitId: { in: visibleUnitIds } }] };
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
          if (charge.period === period && charge.active) { expected += charge.amountCents; paid += paidCents(charge); }
          debt += overdueDebtCents(charge);
        }
      }
    }
    const bankCoverage = bankVerificationCoverage(property.units, paymentLinks);
    return { property, expected, paid, debt, rate: expected ? Math.round(paid / expected * 100) : 100, bankVerified:bankCoverage.allVerified, bankVerifiedCount:bankCoverage.verifiedUnits, bankConfiguredCount:bankCoverage.configuredUnits, bankUnits:bankCoverage.totalUnits };
  });
  const activeRows = rows.filter((row) => row.property.active);
  const inactiveRows = rows.filter((row) => !row.property.active);
  const expected = activeRows.reduce((sum, row) => sum + row.expected, 0);
  const paid = activeRows.reduce((sum, row) => sum + row.paid, 0);
  const debt = activeRows.reduce((sum, row) => sum + row.debt, 0);
  const contractAlerts = leaseAlertsForProperties(activeProperties);
  const expiryCount = contractAlerts.filter((row) => row.kind === "EXPIRY").length;
  const anniversaryCount = contractAlerts.filter((row) => row.kind === "ANNIVERSARY").length;
  const unmatchedCount = user.role === "SUPER_ADMIN" ? (await Promise.all([
    prisma.bankTransaction.count({ where: { amountCents: { gt: 0 }, status: { in: ["UNMATCHED", "SUGGESTED"] }, bankAccount: { propertyId: { in: propertyIds } } } }),
      prisma.inboxPayment.count({ where: { status: { in: ["RECEIVED", "UNMATCHED", "ERROR"] }, ...(selection.mode === "ALL" ? { OR: [{ propertyId: null }, { propertyId: { in: propertyIds } }] } : { propertyId: { in: propertyIds } }) } }),
  ])).reduce((sum, value) => sum + value, 0) : 0;
  const overdueRevisions=revisions.filter((r)=>complianceState(r).key==="overdue");
  const bankVerifiedUnits = activeRows.reduce((sum, row) => sum + row.bankVerifiedCount, 0);
  const bankTotalUnits = activeRows.reduce((sum, row) => sum + row.bankUnits, 0);

  const attention: {title:string;detail:string;href:string;tone:"bad"|"warn"|"info"}[]=[];
  if(debt>0)attention.push({title:`Dluh po splatnosti ${money(debt)}`,detail:"Otevřít portfolio dlužníků",href:"/reporty/saldo",tone:"bad"});
  if(unmatchedCount>0)attention.push({title:`${unmatchedCount} nespárovaných plateb`,detail:"Platby čekají na kontrolu",href:"/platby/nesparovane",tone:"warn"});
  for(const task of tasks.slice(0,4))attention.push({title:task.title,detail:`${task.property.name} · ${taskCategories[task.category]} · ${task.assignee?.name||"bez odpovědného"}`,href:`/ukoly/${task.id}`,tone:task.priority==="URGENT"?"bad":"warn"});
  for(const item of revisions.slice(0,3))attention.push({title:item.name,detail:`${item.property.name} · ${date(item.nextDueAt)} · ${complianceState(item).label}`,href:`/nemovitosti/${item.propertyId}/provoz#revize`,tone:complianceState(item).key==="overdue"?"bad":"warn"});
  for(const alert of contractAlerts.slice(0,3))attention.push({title:`${alert.kind==="EXPIRY"?"Expirace":"Výročí"} · ${alert.lease.unit.label}`,detail:`${alert.property.name} · ${alert.lease.tenant.name} · ${date(alert.date)}`,href:`/smlouvy/${alert.lease.id}`,tone:"info"});

  return <Shell user={user}><div className="page v21-portfolio"><div className="page-title"><div><h1>Portfolio</h1><p>{portfolioSelectionLabel(selection,properties.length,availableProperties.length,availableProperties.filter((property)=>property.active).length)} · období {period}.</p></div><PortfolioScopePicker availableProperties={availableProperties.map(({id,name,address,city,active})=>({id,name,address,city,active}))} selection={selection.mode==="ALL"?selection:{mode:"SELECTED",propertyIds:allowedSelection}}/></div><Flash ok={query.ok} error={query.error}/>
    <div className="stat-grid v21-stat-grid"><Kpi href={`/reporty?view=collections${scopeQuery}`} icon={<CheckCircle2/>} label="Inkaso" value={expected?`${Math.round(paid/expected*100)} %`:"—"} note={`${money(paid)} z ${money(expected)}`} tone="green"/><Kpi href={`/reporty?view=collections${scopeQuery}`} icon={<WalletCards/>} label="Dluh" value={money(debt)} note="po splatnosti" tone="red" bad={debt>0}/><Kpi href={`/ukoly?${scopeQuery.slice(1)}`} icon={<ListChecks/>} label="Úkoly" value={String(tasks.length)} note="otevřených případů" tone="orange" bad={tasks.some(t=>t.priority==="URGENT")}/><Kpi href={`/revize?${scopeQuery.slice(1)}`} icon={<ClipboardCheck/>} label="Revize" value={String(revisions.length)} note={`${overdueRevisions.length} po termínu`} tone="purple" bad={overdueRevisions.length>0}/><Kpi href={`/smlouvy/upozorneni?${scopeQuery.slice(1)}`} icon={<CalendarCheck2/>} label="Smlouvy" value={String(contractAlerts.length)} note={`${expiryCount} expirace · ${anniversaryCount} výročí`} tone="blue"/>{user.role==="SUPER_ADMIN"&&<Kpi href="/platby/nesparovane" icon={<AlertCircle/>} label="Nespárované" value={String(unmatchedCount)} note="plateb k řešení" tone="red" bad={unmatchedCount>0}/>}</div>
    <div className="detail-grid v21-dashboard-grid"><div className="card col-8 attention-card"><div className="card-head"><div><h2>Vyžaduje pozornost</h2><p className="muted-copy">Úkoly, finance, smlouvy a technické termíny v jedné pracovní frontě.</p></div></div><div className="attention-list">{attention.length?attention.slice(0,10).map((item,index)=><Link className={`attention-item ${item.tone}`} href={item.href} key={`${item.href}-${index}`}><span className="attention-icon"><AlertCircle size={17}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><b>→</b></Link>):<div className="calm-state"><CheckCircle2 size={22}/><div><strong>Portfolio je bez akutních událostí</strong><span>Žádná položka právě nevyžaduje okamžitý zásah.</span></div></div>}</div></div><div className="card col-4"><h2>Stav portfolia</h2><div className="summary-list"><div><span>Aktivní nemovitosti</span><strong>{activeRows.length}</strong></div><div><span>Neaktivní / archivované</span><strong>{inactiveRows.length}</strong></div><div><span>Otevřené úkoly</span><strong>{tasks.length}</strong></div><div><span>Revize do 60 dní</span><strong>{revisions.length}</strong></div><div><span>Expirace smluv</span><strong>{expiryCount}</strong></div><div><span>Výročí smluv</span><strong>{anniversaryCount}</strong></div><div><span>Bankovní účty jednotek</span><strong>{bankVerifiedUnits} / {bankTotalUnits}</strong></div></div></div></div>
    <div className="card portfolio-table-card" id="nemovitosti"><div className="table-toolbar"><div><h2>Nemovitosti</h2><p>Kliknutím otevřete provozní dashboard objektu.</p></div></div><div className="table-wrap"><table><thead><tr><th>Nemovitost</th><th>Vlastník / SPV</th><th>Bankovní e-mail</th><th>Předpis</th><th>Dluh</th><th>Inkaso</th><th>Stav</th></tr></thead><tbody>{rows.length?<>{renderPropertyRows(activeRows)}{inactiveRows.length>0&&<tr className="archive-section-row"><td colSpan={7}>Neaktivní / archivované</td></tr>}{renderPropertyRows(inactiveRows,true)}</>:<tr><td colSpan={7} className="table-empty">Zatím nejsou evidované nemovitosti.</td></tr>}</tbody></table></div></div>
  </div></Shell>;
}
function Kpi({href,icon,label,value,note,tone,bad=false}:{href:string;icon:React.ReactNode;label:string;value:string;note:string;tone:string;bad?:boolean}){return <Link className="card stat stat-link" href={href}><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong className={bad?"negative":""}>{value}</strong><small className={bad?"bad":tone==="green"?"good":""}>{note}</small></div><b className="stat-arrow">→</b></Link>}

function renderPropertyRows(rows: Array<{ property: Awaited<ReturnType<typeof accessibleProperties>>[number]; expected: number; debt: number; rate: number; bankVerified: boolean; bankVerifiedCount: number; bankConfiguredCount: number; bankUnits: number }>, archived = false) {
  return rows.map(({property,expected:propertyExpected,debt:propertyDebt,rate,bankVerified,bankVerifiedCount,bankConfiguredCount,bankUnits})=><tr className={`property-row${archived?" archived-property-row":""}`} key={property.id}><td><Link className="property-cell" href={`/nemovitosti/${property.id}/prehled`}><div className="property-icon-frame property-icon-frame-sm"><PropertyIcon technicalData={property.technicalData} unitCount={property.units.length}/></div><div><strong>{property.name}</strong><small>{property.address}, {property.city}</small></div></Link></td><td><span className="owner-label">{property.ownerships.length?property.ownerships.map(o=>o.owner.name).join(", "):property.owner.name}</span></td><td><span className={`status ${bankVerified?"ok":"warn"}`}>{bankUnits===0?"Bez jednotek":bankVerified?`${bankVerifiedCount}/${bankUnits} jednotek`:bankConfiguredCount?`${bankVerifiedCount}/${bankUnits} jednotek ověřeno`:"Bez účtu u jednotek"}</span></td><td className="money">{money(propertyExpected)}</td><td className={propertyDebt?"money negative":"money positive"}>{money(propertyDebt)}</td><td><div className="collection-top"><span>{rate}%</span></div><div className={`progress ${rate<85?"bad":rate<95?"warn":""}`}><i style={{width:`${Math.min(rate,100)}%`}}/></div></td><td><span className={`status ${archived?"archived":propertyDebt?"bad":rate>=100?"ok":"warn"}`}>{archived?"Archivováno":propertyDebt?"Vyžaduje pozornost":rate>=100?"V pořádku":"Rozpracováno"}</span></td></tr>);
}
