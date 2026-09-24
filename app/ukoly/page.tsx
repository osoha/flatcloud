import { TaskSectionNav } from "@/components/TaskSectionNav";
import { isFlatcloudMember } from "@/lib/user-context-policy";
import { PageHeading } from "@/components/PageHeading";
import { taskEntryVisibilityWhere } from "@/lib/task-access";
import Link from "next/link";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { accessibleProperties, taskAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date } from "@/lib/format";
import { taskCategories, taskPriorities, taskStatuses } from "@/lib/labels";
import { openTaskStatuses } from "@/lib/operations";
import { Shell } from "@/components/Shell";
import { NavigableTableRow } from "@/components/NavigableTableRow";
import { PortfolioScopePicker } from "@/components/PortfolioScopePicker";
import { parsePortfolioSelection, portfolioSelectionLabel, selectedPropertyIds } from "@/lib/portfolio-selection";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ properties?: string; propertyId?: string; status?: string; view?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const availableProperties = await accessibleProperties(user);
  const selection = parsePortfolioSelection(query);
  const allowedIds = selectedPropertyIds(selection, availableProperties.map((property) => property.id));
  const properties = availableProperties.filter((property) => allowedIds.includes(property.id));
  const propertyIds = properties.map((property) => property.id);
  const accessScope = taskAccessWhere(user);
  const selectionScope = selection.mode === "ALL" ? {} : { OR: [{ propertyId: { in: propertyIds } }, { propertyId: null }] };
  const statusWhere = query.status === "open" ? { status: { in: openTaskStatuses } } : query.status === "done" ? { status: "DONE" as const } : {};
  const stateWhere = query.view === "favorites" ? { userStates: { some: { userId: user.id, favorite: true } } } : query.view === "hidden" ? { userStates: { some: { userId: user.id, dismissedAt: { not: null } } } } : {};
  const rawTasks = await prisma.task.findMany({
    where: { AND: [accessScope, selectionScope, statusWhere, stateWhere] },
    include: { property: true, unit: true, tenant: true, assignee: true, userStates: { where: { userId: user.id } }, members: { include: { user: true } }, _count: { select: { entries: { where: taskEntryVisibilityWhere(user) } } } },
  });
  const now = Date.now();
  const urgency = (task: typeof rawTasks[number]) => !openTaskStatuses.includes(task.status) ? 9 : task.dueAt && task.dueAt.getTime() < now ? 0 : task.priority === "URGENT" ? 1 : task.priority === "HIGH" ? 2 : task.dueAt && task.dueAt.getTime() < now + 7*86_400_000 ? 3 : task.priority === "NORMAL" ? 4 : 5;
  const tasks = rawTasks.sort((a,b)=>urgency(a)-urgency(b)||Number(b.userStates[0]?.favorite||false)-Number(a.userStates[0]?.favorite||false)||(a.dueAt?.getTime()??Infinity)-(b.dueAt?.getTime()??Infinity)||b.updatedAt.getTime()-a.updatedAt.getTime());
  const open = tasks.filter((task) => openTaskStatuses.includes(task.status)).length;
  const collection = tasks.filter((task) => task.category === "COLLECTION" && openTaskStatuses.includes(task.status)).length;
  const overdue = tasks.filter((task) => task.dueAt && task.dueAt < new Date() && openTaskStatuses.includes(task.status)).length;
  const selectionValue = selection.mode === "ALL" ? "" : `&properties=${encodeURIComponent(allowedIds.join(","))}`;
  return <Shell user={user} taskPropertyId={properties.length===1?properties[0].id:undefined}><div className="page">
    <div data-guide="tasks" className="page-title"><div><PageHeading>Úkoly a případy</PageHeading><p>Jedno místo pro provozní úkoly, vymáhání nájemného a komunikaci mezi správcem a vlastníkem.</p></div><PortfolioScopePicker availableProperties={availableProperties.map((property)=>({id:property.id,name:property.name,address:property.address,city:property.city,active:property.active,ownerId:property.communicationOwner?.id||property.owner.id,ownerName:property.communicationOwner?.name||property.owner.name,scopeKind: !isFlatcloudMember(user) ? undefined : property.flatcloudConsolidationBasisPoints==null?"UNCLASSIFIED" as const:property.flatcloudConsolidationBasisPoints>0?"FLATCLOUD" as const:"EXTERNAL" as const}))} selection={selection.mode==="ALL"?selection:{mode:"SELECTED",propertyIds:allowedIds}}/></div>
    <TaskSectionNav user={user} active="tasks"/>
    <div className="task-status-tabs"><Link className={!query.status&&!query.view?"active":""} href={`/ukoly?${selectionValue.slice(1)}`}>Vše</Link><Link className={query.status==="open"?"active":""} href={`/ukoly?status=open${selectionValue}`}>Otevřené</Link><Link className={query.status==="done"?"active":""} href={`/ukoly?status=done${selectionValue}`}>Hotové</Link><Link className={query.view==="favorites"?"active":""} href={`/ukoly?view=favorites${selectionValue}`}>★ Oblíbené</Link><Link className={query.view==="hidden"?"active":""} href={`/ukoly?view=hidden${selectionValue}`}>Skryté z přehledu</Link></div>
    <div className="stat-grid compact-stats"><MiniStat label="Otevřené" value={String(open)} note="vyžadují řešení"/><MiniStat label="Upomínky" value={String(collection)} note="aktivní případy" bad={collection>0}/><MiniStat label="Po termínu" value={String(overdue)} note="úkoly po deadline" bad={overdue>0}/></div>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Pracovní fronta</h2><p>Vlastník vidí stav případu a průběžné zápisy bez nutnosti obvolávat správce.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Úkol</th><th>Nemovitost</th><th>Typ</th><th>Odpovědný</th><th>Termín</th><th>Priorita</th><th>Stav</th><th></th></tr></thead><tbody>
      {tasks.length ? tasks.map((task)=>{const state=task.userStates[0];const unread=!state?.lastReadAt||state.lastReadAt<task.updatedAt;return <NavigableTableRow href={`/ukoly/${task.id}`} ariaLabel={`Otevřít úkol ${task.title}`} key={task.id}><td><strong>{task.title}</strong>{unread&&<span className="status warn">Nové</span>}<span className="owner-sub">{task.tenant?.name || `${task._count.entries} záznamů · ${task.members.length} účastníků`}</span></td><td>{task.property?<><Link className="entity-link" href={`/nemovitosti/${task.propertyId}/prehled`}>{task.property.name}</Link><span className="owner-sub">{task.unit?.label || "Celý objekt"}</span></>:<><strong>Obecné týmové vlákno</strong><span className="owner-sub">Bez přístupu k nemovitostem</span></>}</td><td>{taskCategories[task.category]}</td><td>{task.assignee?.name || "Nepřiřazen"}</td><td>{task.dueAt ? date(task.dueAt) : "—"}</td><td><span className={`status ${task.priority==="URGENT"?"bad":task.priority==="HIGH"?"warn":""}`}>{taskPriorities[task.priority]}</span></td><td><span className={`status ${task.status==="DONE"?"ok":task.status==="WAITING"?"warn":task.status==="CANCELLED"?"":"bad"}`}>{taskStatuses[task.status]}</span></td><td><form action={`/api/tasks/${task.id}/state`} method="post"><input type="hidden" name="action" value={state?.favorite?"unfavorite":"favorite"}/><input type="hidden" name="returnTo" value={query.view?`/ukoly?view=${query.view}`:"/ukoly"}/><button className="icon-button" type="submit" aria-label={state?.favorite?"Odebrat z oblíbených":"Přidat do oblíbených"} title={state?.favorite?"Odebrat z oblíbených":"Přidat do oblíbených"}>{state?.favorite?"★":"☆"}</button></form>{state?.dismissedAt&&<form action={`/api/tasks/${task.id}/state`} method="post"><input type="hidden" name="action" value="restore"/><input type="hidden" name="returnTo" value="/ukoly?view=hidden"/><button className="table-link" type="submit">Vrátit do přehledu</button></form>}</td></NavigableTableRow>}) : <tr><td colSpan={8} className="table-empty">Žádné úkoly pro zvolený filtr.</td></tr>}
      </tbody></table></div>
    </div>
  </div></Shell>;
}
function MiniStat({label,value,note,bad=false}:{label:string;value:string;note:string;bad?:boolean}){return <div className="card stat"><div><span>{label}</span><strong className={bad?"negative":""}>{value}</strong><small className={bad?"bad":""}>{note}</small></div></div>}
