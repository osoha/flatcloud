import { portfolioSelectionQuery, parsePortfolioSelection, portfolioSelectionLabel, selectedPropertyIds } from "@/lib/portfolio-selection";
import { filterPortfolioProperties, portfolioPropertyOption, portfolioTaskFilter } from "@/lib/portfolio-ownership";
import { TaskSectionNav } from "@/components/TaskSectionNav";
import { isFlatcloudMember } from "@/lib/user-context-policy";
import { PageHeading } from "@/components/PageHeading";
import { taskEntryVisibilityWhere, taskQueueWhere } from "@/lib/task-access";
import {ScopeAwareLink as Link} from "@/components/ScopeAwareLink";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { accessibleProperties, taskAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date } from "@/lib/format";
import { taskCategories, taskPriorities, taskStatuses } from "@/lib/labels";
import { openTaskStatuses } from "@/lib/operations";
import { Shell } from "@/components/Shell";
import { NavigableTableRow } from "@/components/NavigableTableRow";
import { PortfolioScopePicker } from "@/components/PortfolioScopePicker";
import { displayMode } from "@/lib/display-mode";
import { BasicSectionHero, BasicSectionStat, BasicSectionItem } from "@/components/BasicSection";
import { Bell, ListChecks } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
const archivePageSize = 25;
const recentCompletedCount = 5;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ ownerId?: string; properties?: string; propertyId?: string; status?: string; view?: string; scope?: string; page?: string }> }) {
  const user = await requireUser();
  const basic = await displayMode(user.id, user.onboardingStatus === "pending" || user.defaultDisplayMode === "basic" ? "basic" : "pro") === "basic";
  const query = await searchParams;
  const availableProperties = await accessibleProperties(user,{includeInactive:true});
  const selection = parsePortfolioSelection(query);
  const allowedIds = selectedPropertyIds(selection, availableProperties.map((property) => property.id));
  const properties = filterPortfolioProperties(availableProperties, selection);
  const propertyIds = properties.map((property) => property.id);
  const accessScope = {AND:[taskAccessWhere(user),...(query.scope === "all" ? [] : [taskQueueWhere(user)])]};
  const selectionScope = portfolioTaskFilter(properties, selection);
  const archive = query.status === "done";
  const defaultView = !query.status && !query.view;
  const requestedPage = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const archivedStatuses = ["DONE", "CANCELLED"] as const;
  const statusWhere = (query.status === "open" || (basic&&!archive&&!query.status)) ? { status: { in: openTaskStatuses } } : archive ? { status: { in: [...archivedStatuses] } } : {};
  const stateWhere = query.view === "favorites" ? { userStates: { some: { userId: user.id, favorite: true } } } : query.view === "hidden" ? { userStates: { some: { userId: user.id, dismissedAt: { not: null } } } } : {};
  const archiveWhere: Prisma.TaskWhereInput = { AND: [accessScope, selectionScope, { status: { in: [...archivedStatuses] } }] };
  const archiveCount = defaultView || archive ? await prisma.task.count({ where: archiveWhere }) : 0;
  const page = archive ? Math.min(requestedPage, Math.max(1, Math.ceil(archiveCount / archivePageSize))) : 1;
  const listTasks = (where: Prisma.TaskWhereInput, take?: number, skip?: number) => prisma.task.findMany({
    where, take, skip,
    orderBy: take ? [{ closedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }] : undefined,
    include: { property: true, unit: true, tenant: true, assignee: true, userStates: { where: { userId: user.id } }, members: { include: { user: true } }, _count: { select: { entries: { where: taskEntryVisibilityWhere(user) } } } },
  });
  const rawTasks = defaultView
    ? [...await listTasks({ AND: [accessScope, selectionScope, { status: { in: openTaskStatuses } }] }), ...(basic?[]:await listTasks({ AND: [accessScope, selectionScope, { status: "DONE" }] }, recentCompletedCount))]
    : await listTasks({ AND: [accessScope, selectionScope, statusWhere, stateWhere] }, archive ? archivePageSize : undefined, archive ? (page - 1) * archivePageSize : undefined);
  const now = Date.now();
  const urgency = (task: typeof rawTasks[number]) => !openTaskStatuses.includes(task.status) ? 9 : task.dueAt && task.dueAt.getTime() < now ? 0 : task.priority === "URGENT" ? 1 : task.priority === "HIGH" ? 2 : task.dueAt && task.dueAt.getTime() < now + 7*86_400_000 ? 3 : task.priority === "NORMAL" ? 4 : 5;
  const tasks = rawTasks.sort((a,b)=>urgency(a)-urgency(b)||(!openTaskStatuses.includes(a.status)&&!openTaskStatuses.includes(b.status)?(b.closedAt?.getTime()??b.updatedAt.getTime())-(a.closedAt?.getTime()??a.updatedAt.getTime()):Number(b.userStates[0]?.favorite||false)-Number(a.userStates[0]?.favorite||false)||(a.dueAt?.getTime()??Infinity)-(b.dueAt?.getTime()??Infinity)||b.updatedAt.getTime()-a.updatedAt.getTime()));
  const [open, collection, overdue] = archive ? await Promise.all([
    prisma.task.count({where:{AND:[accessScope,selectionScope,{status:{in:openTaskStatuses}}]}}),
    prisma.task.count({where:{AND:[accessScope,selectionScope,{status:{in:openTaskStatuses},category:"COLLECTION"}]}}),
    prisma.task.count({where:{AND:[accessScope,selectionScope,{status:{in:openTaskStatuses},dueAt:{lt:new Date()}}]}}),
  ]) : [tasks.filter((task) => openTaskStatuses.includes(task.status)).length,tasks.filter((task) => task.category === "COLLECTION" && openTaskStatuses.includes(task.status)).length,tasks.filter((task) => task.dueAt && task.dueAt < new Date() && openTaskStatuses.includes(task.status)).length];
  const selectionValue = (portfolioSelectionQuery(selection) ? `&${portfolioSelectionQuery(selection)}` : "") + (query.scope === "all" ? "&scope=all" : "");
  const archiveHref = `/ukoly?status=done${selectionValue}`;
  const unseenArchiveCount = archiveCount - tasks.filter(task=>task.status==="DONE").length;
  const archiveLink = defaultView && archiveCount > 0 ? <Link className="task-archive-link" href={archiveHref}>› Zobrazit archivované dokončené úkoly {unseenArchiveCount > 0 ? `(${unseenArchiveCount} dalších)` : ""}</Link> : null;
  const archivePages = archive && archiveCount > archivePageSize ? <nav className="task-archive-pages" aria-label="Stránky archivu">{page>1?<Link href={`${archiveHref}&page=${page-1}`}>← Předchozí</Link>:<span>← Předchozí</span>}<span>Strana {page} z {Math.ceil(archiveCount/archivePageSize)}</span>{page*archivePageSize<archiveCount?<Link href={`${archiveHref}&page=${page+1}`}>Další →</Link>:<span>Další →</span>}</nav> : null;
  return <Shell user={user} taskPropertyId={properties.length===1?properties[0].id:undefined}>{basic ? <div className="page basic-section-page" data-guide="tasks">
    <BasicSectionHero eyebrow="Moje práce" title="Úkoly" description="Dnešní priority, otevřené případy a společná konverzace." berry="tasks" message={overdue ? `${overdue} ${overdue===1?"úkol je":"úkoly jsou"} po termínu.` : open ? `${open} ${open===1?"otevřený úkol":"otevřených úkolů"} čeká na vyřízení.` : "Všechny úkoly jsou vyřízené."}/>
    <div className="basic-section-stats"><BasicSectionStat label="Otevřené" value={String(open)} detail="případy k řešení" tone="amber"/><BasicSectionStat label="Po termínu" value={String(overdue)} detail="nejvyšší priorita" tone={overdue?"red":"green"}/><BasicSectionStat label="Upomínky" value={String(collection)} detail="aktivní případy plateb" tone="blue"/></div>
    <PortfolioScopePicker viewerId={user.id} availableProperties={availableProperties.map(property => portfolioPropertyOption(property, isFlatcloudMember(user)))} selection={selection.mode==="ALL"?selection:{...selection,mode:"SELECTED",propertyIds:allowedIds}}/>
    <TaskSectionNav user={user} active="tasks"/><nav className="task-queue-tabs" aria-label="Rozsah úkolů"><Link className={query.scope!=="all"?"active":""} href={`/ukoly?${portfolioSelectionQuery(selection)}`}>Moje portfolio a úkoly</Link><Link className={query.scope==="all"?"active":""} href={`/ukoly?scope=all&${portfolioSelectionQuery(selection)}`}>Všechny dostupné úkoly</Link></nav>
    <div className="task-status-tabs"><Link className={!query.status&&!query.view?"active":""} href={`/ukoly?${selectionValue.slice(1)}`}>K vyřízení</Link><Link className={query.status==="open"?"active":""} href={`/ukoly?status=open${selectionValue}`}>Otevřené</Link><Link className={query.status==="done"?"active":""} href={archiveHref}>Archiv</Link><Link className={query.view==="favorites"?"active":""} href={`/ukoly?view=favorites${selectionValue}`}>★ Oblíbené</Link><Link className={query.view==="hidden"?"active":""} href={`/ukoly?view=hidden${selectionValue}`}>Skryté</Link></div>
    <div className="basic-section-heading"><h2>{archive?"Dokončené a zrušené":query.view==="favorites"?"Oblíbené":query.view==="hidden"?"Skryté":"K vyřízení"}</h2><Link className="primary" href="/ukoly/novy">＋ Nový úkol</Link></div>
    <div className="basic-section-list">{tasks.length?tasks.map(task=><BasicSectionItem key={task.id} href={`/ukoly/${task.id}`} icon={<ListChecks size={24}/>} title={task.title} context={`${task.property?.name||"Obecné vlákno"}${task.unit?` · ${task.unit.label}`:""} · ${task.assignee?.name||"Bez odpovědného"} · ${task.dueAt?date(task.dueAt):"bez termínu"}`} tone={task.dueAt&&task.dueAt.getTime()<now&&openTaskStatuses.includes(task.status)?"red":task.status==="DONE"?"green":"amber"} end={<span className={`status ${task.status==="DONE"?"ok":task.status==="WAITING"?"warn":"bad"}`}>{taskStatuses[task.status]}</span>}/>):<p className="card table-empty">Žádné úkoly pro zvolený filtr.</p>}</div>
    {archiveLink}{archivePages}
    <div className="basic-section-heading"><h2>Oznámení</h2><Link href="/ukoly/oznameni">Všechna oznámení →</Link></div><BasicSectionItem href="/ukoly/oznameni" icon={<Bell size={23}/>} title="Zprávy pro vás" context="Oznámení a společné informace"/>
  </div> : <div className="page">
    <div data-guide="tasks" className="page-title"><div><PageHeading>Úkoly a případy</PageHeading><p>Jedno místo pro provozní úkoly, vymáhání nájemného a komunikaci mezi správcem a vlastníkem.</p></div><PortfolioScopePicker viewerId={user.id} availableProperties={availableProperties.map(property => portfolioPropertyOption(property, isFlatcloudMember(user)))} selection={selection.mode==="ALL"?selection:{...selection,mode:"SELECTED",propertyIds:allowedIds}}/></div>
    <TaskSectionNav user={user} active="tasks"/><nav className="task-queue-tabs" aria-label="Rozsah úkolů"><Link className={query.scope!=="all"?"active":""} href={`/ukoly?${portfolioSelectionQuery(selection)}`}>Moje portfolio a úkoly</Link><Link className={query.scope==="all"?"active":""} href={`/ukoly?scope=all&${portfolioSelectionQuery(selection)}`}>Všechny dostupné úkoly</Link></nav>
    <div className="task-status-tabs"><Link className={!query.status&&!query.view?"active":""} href={`/ukoly?${selectionValue.slice(1)}`}>Vše</Link><Link className={query.status==="open"?"active":""} href={`/ukoly?status=open${selectionValue}`}>Otevřené</Link><Link className={query.status==="done"?"active":""} href={archiveHref}>Archiv</Link><Link className={query.view==="favorites"?"active":""} href={`/ukoly?view=favorites${selectionValue}`}>★ Oblíbené</Link><Link className={query.view==="hidden"?"active":""} href={`/ukoly?view=hidden${selectionValue}`}>Skryté z přehledu</Link></div>
    <div className="stat-grid compact-stats"><MiniStat label="Otevřené" value={String(open)} note="vyžadují řešení"/><MiniStat label="Upomínky" value={String(collection)} note="aktivní případy" bad={collection>0}/><MiniStat label="Po termínu" value={String(overdue)} note="úkoly po deadline" bad={overdue>0}/></div>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Pracovní fronta</h2><p>Vlastník vidí stav případu a průběžné zápisy bez nutnosti obvolávat správce.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Úkol</th><th>Nemovitost</th><th>Typ</th><th>Odpovědný</th><th>Termín</th><th>Priorita</th><th>Stav</th><th></th></tr></thead><tbody>
      {tasks.length ? tasks.map((task)=>{const state=task.userStates[0];const unread=!state?.lastReadAt||state.lastReadAt<task.updatedAt;return <NavigableTableRow href={`/ukoly/${task.id}`} ariaLabel={`Otevřít úkol ${task.title}`} key={task.id}><td><strong>{task.title}</strong>{unread&&<span className="status warn">Nové</span>}<span className="owner-sub">{task.tenant?.name || `${task._count.entries} záznamů · ${task.members.length} účastníků`}</span></td><td>{task.property?<><Link className="entity-link" href={`/nemovitosti/${task.propertyId}/prehled`}>{task.property.name}</Link><span className="owner-sub">{task.unit?.label || "Celý objekt"}</span></>:<><strong>Obecné týmové vlákno</strong><span className="owner-sub">Bez přístupu k nemovitostem</span></>}</td><td>{taskCategories[task.category]}</td><td>{task.assignee?.name || "Nepřiřazen"}</td><td>{task.dueAt ? date(task.dueAt) : "—"}</td><td><span className={`status ${task.priority==="URGENT"?"bad":task.priority==="HIGH"?"warn":""}`}>{taskPriorities[task.priority]}</span></td><td><span className={`status ${task.status==="DONE"?"ok":task.status==="WAITING"?"warn":task.status==="CANCELLED"?"":"bad"}`}>{taskStatuses[task.status]}</span></td><td><form action={`/api/tasks/${task.id}/state`} method="post"><input type="hidden" name="action" value={state?.favorite?"unfavorite":"favorite"}/><input type="hidden" name="returnTo" value={query.view?`/ukoly?view=${query.view}`:"/ukoly"}/><button className="icon-button" type="submit" aria-label={state?.favorite?"Odebrat z oblíbených":"Přidat do oblíbených"} title={state?.favorite?"Odebrat z oblíbených":"Přidat do oblíbených"}>{state?.favorite?"★":"☆"}</button></form>{state?.dismissedAt&&<form action={`/api/tasks/${task.id}/state`} method="post"><input type="hidden" name="action" value="restore"/><input type="hidden" name="returnTo" value="/ukoly?view=hidden"/><button className="table-link" type="submit">Vrátit do přehledu</button></form>}</td></NavigableTableRow>}) : <tr><td colSpan={8} className="table-empty">Žádné úkoly pro zvolený filtr.</td></tr>}
      </tbody></table></div>
    </div>
    {archiveLink}{archivePages}
  </div>}</Shell>;
}
function MiniStat({label,value,note,bad=false}:{label:string;value:string;note:string;bad?:boolean}){return <div className="card stat"><div><span>{label}</span><strong className={bad?"negative":""}>{value}</strong><small className={bad?"bad":""}>{note}</small></div></div>}
