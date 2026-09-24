import { PortfolioStatusStrip } from "@/components/PortfolioStatusStrip";
import { MetricTrend } from "@/components/MetricTrend";
import { overdueDebtCentsAsOf } from "@/lib/reporting/finance";
import { isFlatcloudMember } from "@/lib/user-context-policy";
import { loadEntityAppearances } from "@/lib/entity-appearance";
import { collectionComparison } from "@/lib/collection-comparison";
import { KpiTrend } from "@/components/KpiTrend";
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { AlertCircle, CalendarCheck2, CheckCircle2, ClipboardCheck, ListChecks, WalletCards } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { CollectionProgress } from "@/components/CollectionProgress";
import { HighlightedPropertyRow } from "@/components/HighlightedPropertyRow";
import { loadEntityPhotos } from "@/lib/entity-photos";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { accessibleProperties, taskAccessWhere } from "@/lib/access";
import { activeAnnouncementWhere } from "@/lib/announcements";
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
import { liveSelectedPropertyIds, parsePortfolioSelection, portfolioSelectionLabel, selectedPropertyIds, serializePortfolioSelection } from "@/lib/portfolio-selection";
import { businessDateKeyToInstant, businessTodayKey } from "@/lib/calendar";
import { portfolioPropertyStatus } from "@/lib/portfolio-property-status";
import { consolidationLabel } from "@/lib/ownership-scope";

export const dynamic = "force-dynamic";

function announcementPreview(body: string) {
  const text = body.replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  if (characters.length <= 240) return text;
  const start = characters.slice(0, 240).join("");
  const lastSpace = start.lastIndexOf(" ");
  return `${(lastSpace >= 200 ? start.slice(0, lastSpace) : start).trimEnd()}…`;
}

export default async function Portfolio({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; properties?: string; propertyId?: string }> }) {
  const user = await requireUser();
  const [availableProperties, query] = await Promise.all([accessibleProperties(user, { includeInactive: true }), searchParams]);
  const selection = parsePortfolioSelection(query);
  const allowedSelection = selectedPropertyIds(selection, availableProperties.map((property)=>property.id));
  const selectedSet = new Set(allowedSelection);
  const properties = availableProperties.filter((property)=>selectedSet.has(property.id));
  const selectionValue = serializePortfolioSelection(selection);
  const scopeQuery = selectionValue === null ? "" : `&properties=${encodeURIComponent(allowedSelection.join(","))}`;
  const liveIds = new Set(liveSelectedPropertyIds(selection, availableProperties));
  const activeProperties = properties.filter((property) => liveIds.has(property.id));
  const [photos, appearances] = await Promise.all([loadEntityPhotos(user, properties.map(property => property.id)), loadEntityAppearances(user.id)]);
  const period = currentPeriod();
  const fullAccess = hasAllPropertyAccess(user);
  const propertyIds = activeProperties.map((property)=>property.id);
  const propertyWideIds = fullAccess ? propertyIds : activeProperties.filter((property)=>property.memberships.some((m)=>m.userId===user.id)).map((property)=>property.id);
  const visibleUnitIds = activeProperties.flatMap((property)=>property.units.map((unit)=>unit.id));
  const taskScope = fullAccess ? { propertyId: { in: propertyIds } } : taskAccessWhere(user);
  const taskVisibilityScope = { AND: [taskAccessWhere(user), selection.mode === "ALL" ? (fullAccess ? { OR: [taskScope, { propertyId: null }] } : {}) : { OR: [{ propertyId: { in: propertyIds } }, { propertyId: null }] }] };
  const revisionScope = fullAccess ? { propertyId: { in: propertyIds } } : { propertyId: { in: propertyWideIds } };
  const revisionHorizon = new Date(Date.now()+60*86_400_000);

  const [rawTasks, taskCount, announcements, revisions, revisionCount, overdueRevisionCount] = await Promise.all([
    prisma.task.findMany({ where: { AND: [taskVisibilityScope, { status: { in: openTaskStatuses } }, { NOT: { userStates: { some: { userId: user.id, dismissedAt: { not: null } } } } }] }, include: { property: true, assignee: true, userStates: { where: { userId: user.id } } }, take:60 }),
    prisma.task.count({ where: { AND: [taskVisibilityScope, { status: { in: openTaskStatuses } }] } }),
    prisma.announcement.findMany({ where: { AND: [activeAnnouncementWhere(user), { NOT: { userStates: { some: { userId: user.id, dismissedAt: { not: null } } } } }] }, orderBy: [{ severity: "desc" }, { startsAt: "desc" }], take:10 }),
    prisma.complianceItem.findMany({ where: { ...revisionScope, active:true, nextDueAt:{lte:revisionHorizon} }, include:{property:true}, orderBy:{nextDueAt:"asc"}, take:30 }),
    prisma.complianceItem.count({ where: { ...revisionScope, active:true, nextDueAt:{lte:revisionHorizon} } }),
    prisma.complianceItem.count({ where: { ...revisionScope, active:true, nextDueAt:{lt:businessDateKeyToInstant(businessTodayKey())} } }),
  ]);
  const urgency = (task: typeof rawTasks[number]) => task.dueAt && task.dueAt.getTime() < Date.now() ? 0 : task.priority === "URGENT" ? 1 : task.priority === "HIGH" ? 2 : task.dueAt && task.dueAt.getTime() < Date.now()+7*86_400_000 ? 3 : task.priority === "NORMAL" ? 4 : 5;
  const tasks = rawTasks.sort((a,b)=>urgency(a)-urgency(b)||Number(b.userStates[0]?.favorite||false)-Number(a.userStates[0]?.favorite||false)||(a.dueAt?.getTime()??Infinity)-(b.dueAt?.getTime()??Infinity));

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
    return { property, expected, paid, debt, bankVerified:bankCoverage.allVerified, bankVerifiedCount:bankCoverage.verifiedUnits, bankConfiguredCount:bankCoverage.configuredUnits, bankUnits:bankCoverage.totalUnits };
  });
  const favoriteFirst = (a: typeof rows[number], b: typeof rows[number]) => Number(appearances[`property:${b.property.id}`]?.favorite ?? false) - Number(appearances[`property:${a.property.id}`]?.favorite ?? false);
  const activeRows = rows.filter((row) => row.property.active).sort(favoriteFirst);
  const inactiveRows = rows.filter((row) => !row.property.active).sort(favoriteFirst);
  const expected = activeRows.reduce((sum, row) => sum + row.expected, 0);
  const paid = activeRows.reduce((sum, row) => sum + row.paid, 0);
  const debt = activeRows.reduce((sum, row) => sum + row.debt, 0);
  const visibleLeaseIds = activeProperties.flatMap(property => property.units.flatMap(unit => unit.leases.map(lease => lease.id)));
  const comparisonCharges = await prisma.charge.findMany({ where: { leaseId: { in: visibleLeaseIds }, active: true }, select: {
    period: true, active: true, amountCents: true, dueDate:true, debtTreatment:true, debtTreatmentAt:true,
    allocations: { select: { amountCents: true, transaction: { select: { bookedAt: true } } } },
    securityDepositOffsets: { select: { amountCents: true, effectiveAt: true } },
    creditApplications: { select: { amountCents: true, effectiveAt: true } },
  } });
  const comparison = collectionComparison(comparisonCharges);
  // The displayed collection amount and its comparison use the same elapsed-day cutoff.
  const collectionTrend = comparison;
  const collectionPaid = comparison?.current.paid ?? paid, collectionExpected = comparison?.current.expected ?? expected;
  const [comparisonYear,comparisonMonth] = (comparison?.previousPeriod || period).split("-").map(Number);
  const previousDate = new Date(Date.UTC(comparisonYear,comparisonMonth-1,comparison?.comparisonDay || 1,12));
  const previousDebt = comparisonCharges.reduce((sum,charge)=>sum+overdueDebtCentsAsOf(charge,previousDate),0);
  const contractAlerts = leaseAlertsForProperties(activeProperties);
  const expiryCount = contractAlerts.filter((row) => row.kind === "EXPIRY").length;
  const anniversaryCount = contractAlerts.filter((row) => row.kind === "ANNIVERSARY").length;
  const unmatchedCount = user.role === "SUPER_ADMIN" ? (await Promise.all([
    prisma.bankTransaction.count({ where: { amountCents: { gt: 0 }, status: { in: ["UNMATCHED", "SUGGESTED"] }, bankAccount: { propertyId: { in: propertyIds } } } }),
      prisma.inboxPayment.count({ where: { status: { in: ["RECEIVED", "UNMATCHED", "ERROR"] }, ...(selection.mode === "ALL" ? { OR: [{ propertyId: null }, { propertyId: { in: propertyIds } }] } : { propertyId: { in: propertyIds } }) } }),
  ])).reduce((sum, value) => sum + value, 0) : 0;
  const bankVerifiedUnits = activeRows.reduce((sum, row) => sum + row.bankVerifiedCount, 0);
  const bankTotalUnits = activeRows.reduce((sum, row) => sum + row.bankUnits, 0);

  const attention: {title:string;detail:string;href:string;tone:"bad"|"warn"|"info";taskId?:string}[]=[];
  if(debt>0)attention.push({title:`Dluh po splatnosti ${money(debt)}`,detail:"Otevřít portfolio dlužníků",href:`/reporty/saldo?${scopeQuery.slice(1)}`,tone:"bad"});
  if(unmatchedCount>0)attention.push({title:`${unmatchedCount} nespárovaných plateb`,detail:"Platby čekají na kontrolu",href:`/platby/nesparovane?${scopeQuery.slice(1)}`,tone:"warn"});
  for(const task of tasks.slice(0,4))attention.push({title:task.title,detail:`${task.property?.name||"Obecné týmové vlákno"} · ${taskCategories[task.category]} · ${task.assignee?.name||"bez odpovědného"}`,href:`/ukoly/${task.id}`,tone:task.priority==="URGENT"?"bad":"warn",taskId:task.id});
  for(const item of revisions.slice(0,3))attention.push({title:item.name,detail:`${item.property.name} · ${date(item.nextDueAt)} · ${complianceState(item).label}`,href:`/nemovitosti/${item.propertyId}/provoz#revize`,tone:complianceState(item).key==="overdue"?"bad":"warn"});
  for(const alert of contractAlerts.slice(0,3))attention.push({title:`${alert.kind==="EXPIRY"?"Expirace":"Výročí"} · ${alert.lease.unit.label}`,detail:`${alert.property.name} · ${alert.lease.tenant.name} · ${date(alert.date)}`,href:`/smlouvy/${alert.lease.id}`,tone:"info"});

  return <Shell user={user}><div className="page v21-portfolio"><div className="page-title"><div><PageHeading>Portfolio</PageHeading><p>{portfolioSelectionLabel(selection,properties.length,availableProperties.length,availableProperties.filter((property)=>property.active).length)} · období {period}.</p></div><div className="action-row"><PortfolioScopePicker availableProperties={availableProperties.map(({id,name,address,city,active,owner,communicationOwner,flatcloudConsolidationBasisPoints})=>({id,name,address,city,active,ownerId:communicationOwner?.id||owner.id,ownerName:communicationOwner?.name||owner.name,scopeKind: !isFlatcloudMember(user) ? undefined : flatcloudConsolidationBasisPoints==null?"UNCLASSIFIED" as const:flatcloudConsolidationBasisPoints>0?"FLATCLOUD" as const:"EXTERNAL" as const}))} selection={selection.mode==="ALL"?selection:{mode:"SELECTED",propertyIds:allowedSelection}}/></div></div><Flash ok={query.ok} error={query.error}/>
    <div className="stat-grid v21-stat-grid"><Kpi href={`/reporty?view=collections${scopeQuery}`} icon={<CheckCircle2/>} label="Inkaso" value={collectionExpected?`${Math.round(collectionPaid/collectionExpected*100)} %`:"—"} note={`${money(collectionPaid)} z ${money(collectionExpected)}${comparison ? ` · k ${comparison.comparisonDay}. dni` : ""}`} tone="green" trend={<KpiTrend comparison={collectionTrend}/>}/><Kpi href={`/reporty?view=collections${scopeQuery}`} icon={<WalletCards/>} label="Dluh" value={money(debt)} note="po splatnosti" tone={debt > 0 ? "red" : "green"} bad={debt>0} trend={<MetricTrend current={debt} previous={comparison?previousDebt:null} unit="cents" period={previousDate.toLocaleDateString("cs-CZ")} higherIsBetter={false}/>}/><Kpi href={`/ukoly?${scopeQuery.slice(1)}`} icon={<ListChecks/>} label="Úkoly" value={String(taskCount)} note="otevřených případů" tone="orange" bad={tasks.some(t=>t.priority==="URGENT")}/><Kpi href={`/revize?${scopeQuery.slice(1)}`} icon={<ClipboardCheck/>} label="Revize" value={String(revisionCount)} note={`${overdueRevisionCount} po termínu`} tone="purple" bad={overdueRevisionCount>0}/><Kpi href={`/smlouvy/upozorneni?${scopeQuery.slice(1)}`} icon={<CalendarCheck2/>} label="Smlouvy" value={String(contractAlerts.length)} note={`${expiryCount} expirace · ${anniversaryCount} výročí`} tone="blue"/>{user.role==="SUPER_ADMIN"&&<Kpi href={`/platby/nesparovane?${scopeQuery.slice(1)}`} icon={<AlertCircle/>} label="Nespárované" value={String(unmatchedCount)} note="plateb k řešení" tone="red" bad={unmatchedCount>0}/>}</div>
    <PortfolioStatusStrip userId={user.id} items={[
      { label: "Aktivní nemovitosti", value: String(activeRows.length) },
      { label: "Neaktivní / archivované", value: String(inactiveRows.length) },
      { label: "Otevřené úkoly", value: String(taskCount) },
      { label: "Revize do 60 dní", value: String(revisionCount) },
      { label: "Expirace smluv", value: String(expiryCount) },
      { label: "Výročí smluv", value: String(anniversaryCount) },
      { label: "Bankovní účty jednotek", value: `${bankVerifiedUnits} / ${bankTotalUnits}` },
    ]}/>
    <div className="detail-grid v21-dashboard-grid"><div className="card col-12 attention-card portfolio-attention-card"><div className="card-head"><div><h2>Vyžaduje pozornost</h2><p className="muted-copy">Oznámení, úkoly, finance, smlouvy a technické termíny v jedné pracovní frontě.</p></div></div><div className={`attention-list portfolio-attention-list${announcements.length + Math.min(attention.length, Math.max(0, 10 - announcements.length)) >= 4 ? " is-multicolumn" : ""}`}>{announcements.map(item=><article className={`attention-item announcement-feed severity-${item.severity.toLowerCase()}`} key={item.id}><span className="attention-icon"><AlertCircle size={17}/></span><span><strong>{item.title}</strong><small>{announcementPreview(item.body)}</small>{item.expiresAt&&<small>Platí do {date(item.expiresAt)}</small>}<Link className="attention-announcement-link" href={`/ukoly/oznameni#oznameni-${item.id}`}>Celé oznámení →</Link></span><form action={`/api/announcements/${item.id}/state`} method="post"><input type="hidden" name="action" value="dismiss"/><input type="hidden" name="returnTo" value="/portfolio"/><button className="secondary attention-dismiss-button" type="submit">Skrýt</button></form></article>)}{attention.length?attention.slice(0,Math.max(0,10-announcements.length)).map((item,index)=><article className={`attention-item ${item.tone}`} key={`${item.href}-${index}`}><span className="attention-icon"><AlertCircle size={17}/></span><Link href={item.href}><strong>{item.title}</strong><small>{item.detail}</small></Link>{item.taskId?<form action={`/api/tasks/${item.taskId}/state`} method="post"><input type="hidden" name="action" value="dismiss"/><input type="hidden" name="returnTo" value="/portfolio"/><button className="secondary attention-dismiss-button" type="submit">Skrýt</button></form>:<Link aria-label={`Otevřít ${item.title}`} href={item.href}><b>→</b></Link>}</article>):announcements.length===0&&<div className="calm-state"><CheckCircle2 size={22}/><div><strong>Portfolio je bez akutních událostí</strong><span>Žádná položka právě nevyžaduje okamžitý zásah.</span></div></div>}</div></div></div>
    <div className="card portfolio-table-card" id="nemovitosti"><div className="table-toolbar"><div><h2>Nemovitosti</h2><p>Kliknutím otevřete provozní dashboard objektu.</p></div></div><div className="table-wrap"><table><thead><tr><th>Nemovitost</th><th>Komunikační vlastník / SVJ</th>{isFlatcloudMember(user)&&<th>KPI FlatCloud</th>}<th>Bankovní e-mail</th><th>Předpis</th><th>Dluh</th><th>Inkaso</th><th>Stav</th><th>Oblíbené</th></tr></thead><tbody>{rows.length?<>{renderPropertyRows(activeRows, photos.properties, appearances, false, isFlatcloudMember(user))}{inactiveRows.length>0&&<tr className="archive-section-row"><td colSpan={isFlatcloudMember(user)?9:8}>Neaktivní / archivované</td></tr>}{renderPropertyRows(inactiveRows, photos.properties, appearances, true, isFlatcloudMember(user))}</>:<tr><td colSpan={isFlatcloudMember(user)?9:8} className="table-empty">Zatím nejsou evidované nemovitosti.</td></tr>}</tbody></table></div><details className="method-tip"><summary>Oblíbené objekty a vlastní vzhled</summary><p>Hvězdičkou přidáte objekt mezi oblíbené a posunete jej nahoru v seznamu. Barvu karty a fotografii či obecný avatar vyberete ve Vzhledu objektu. Nastavení se ukládá k vašemu účtu. Barva je osobní pomůcka, nemění finanční stav; volbou „Bez zvýraznění“ ji odstraníte. <Link href="/metodika?view=chapters#osobni-vzhled-portfolia">Podrobnosti v metodice →</Link></p></details></div>
  </div></Shell>;
}
function Kpi({href,icon,label,value,note,tone,bad=false,trend}:{href:string;icon:React.ReactNode;label:string;value:string;note:string;tone:string;bad?:boolean;trend?:React.ReactNode}){return <Link className="card stat stat-link" href={href}><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong className={bad?"negative":label==="Dluh"?"positive":""}>{value}</strong><small className={bad?"bad":tone==="green"?"good":""}>{note}</small>{trend}</div><b className="stat-arrow">→</b></Link>}

function renderPropertyRows(rows: Array<{ property: Awaited<ReturnType<typeof accessibleProperties>>[number]; expected: number; paid: number; debt: number; bankVerified: boolean; bankVerifiedCount: number; bankConfiguredCount: number; bankUnits: number }>, photos: Record<string, string>, appearances: Awaited<ReturnType<typeof loadEntityAppearances>>, archived = false, internal = false) {
  return rows.map(({property,expected:propertyExpected,paid:propertyPaid,debt:propertyDebt,bankVerified,bankVerifiedCount,bankConfiguredCount,bankUnits})=>{const operationalStatus=portfolioPropertyStatus({archived,expectedCents:propertyExpected,paidCents:propertyPaid,overdueDebtCents:propertyDebt});return <HighlightedPropertyRow favorite={appearances[`property:${property.id}`]?.favorite} color={appearances[`property:${property.id}`]?.color} propertyId={property.id} name={property.name} href={`/nemovitosti/${property.id}/prehled`} className={`property-row${archived?" archived-property-row":""}`} key={property.id}><td><Link className="property-cell" href={`/nemovitosti/${property.id}/prehled`}><EntityAvatar photoId={photos[property.id]}/><div><strong>{property.name}</strong><small>{property.address}, {property.city}</small></div></Link></td><td><span className="owner-label">{property.communicationOwner?.name||property.owner.name}</span></td>{internal&&<td><span className={`status ${property.flatcloudConsolidationBasisPoints==null?"warn":property.flatcloudConsolidationBasisPoints>0?"ok":""}`}>{consolidationLabel(property.flatcloudConsolidationBasisPoints)}</span></td>}<td><span className={`status ${bankVerified?"ok":"warn"}`}>{bankUnits===0?"Bez jednotek":bankVerified?`${bankVerifiedCount}/${bankUnits} jednotek`:bankConfiguredCount?`${bankVerifiedCount}/${bankUnits} jednotek ověřeno`:"Bez účtu u jednotek"}</span></td><td className="money">{money(propertyExpected)}</td><td className={propertyDebt?"money negative":"money positive"}>{money(propertyDebt)}</td><td><CollectionProgress expected={propertyExpected} paid={propertyPaid}/></td><td><span className={`status ${operationalStatus.tone}`}>{operationalStatus.label}</span></td></HighlightedPropertyRow>});
}
