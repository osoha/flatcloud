import Link from "next/link";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { accessibleProperties } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date } from "@/lib/format";
import { taskCategories, taskPriorities, taskStatuses } from "@/lib/labels";
import { openTaskStatuses } from "@/lib/operations";
import { Shell } from "@/components/Shell";
import { NavigableTableRow } from "@/components/NavigableTableRow";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ propertyId?: string; status?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const properties = await accessibleProperties(user);
  const fullAccess = hasAllPropertyAccess(user);
  const propertyIds = properties.map((property) => property.id);
  const propertyWideIds = fullAccess ? propertyIds : properties.filter((property)=>property.memberships.some((m)=>m.userId===user.id)).map((property)=>property.id);
  const visibleUnitIds = properties.flatMap((property)=>property.units.map((unit)=>unit.id));
  const taskScope = fullAccess ? { propertyId: { in: propertyIds } } : { OR: [{ propertyId: { in: propertyWideIds } }, { unitId: { in: visibleUnitIds } }] };
  const statusWhere = query.status === "open" ? { status: { in: openTaskStatuses } } : query.status === "done" ? { status: "DONE" as const } : {};
  const propertyWhere = query.propertyId && propertyIds.includes(query.propertyId) ? { propertyId: query.propertyId } : {};
  const tasks = propertyIds.length ? await prisma.task.findMany({
    where: { AND: [taskScope, statusWhere, propertyWhere] },
    include: { property: true, unit: true, tenant: true, assignee: true, _count: { select: { entries: true } } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { updatedAt: "desc" }],
  }) : [];
  const open = tasks.filter((task) => openTaskStatuses.includes(task.status)).length;
  const collection = tasks.filter((task) => task.category === "COLLECTION" && openTaskStatuses.includes(task.status)).length;
  const overdue = tasks.filter((task) => task.dueAt && task.dueAt < new Date() && openTaskStatuses.includes(task.status)).length;
  const selectedProperty = query.propertyId ? properties.find((property)=>property.id===query.propertyId) : null;
  return <Shell user={user} taskPropertyId={selectedProperty?.id}><div className="page">
    <div className="page-title"><div><h1>Úkoly a případy</h1><p>{selectedProperty ? `${selectedProperty.name} · ` : ""}Jedno místo pro provozní úkoly, vymáhání nájemného a komunikaci mezi správcem a vlastníkem.</p></div></div>
    <div className="task-status-tabs"><Link className={!query.status?"active":""} href={query.propertyId?`/ukoly?propertyId=${query.propertyId}`:"/ukoly"}>Vše</Link><Link className={query.status==="open"?"active":""} href={`/ukoly?status=open${query.propertyId?`&propertyId=${query.propertyId}`:""}`}>Otevřené</Link><Link className={query.status==="done"?"active":""} href={`/ukoly?status=done${query.propertyId?`&propertyId=${query.propertyId}`:""}`}>Hotové</Link>{selectedProperty&&<Link href="/ukoly">Zrušit filtr: {selectedProperty.name}</Link>}</div>
    <div className="stat-grid compact-stats"><MiniStat label="Otevřené" value={String(open)} note="vyžadují řešení"/><MiniStat label="Upomínky" value={String(collection)} note="aktivní případy" bad={collection>0}/><MiniStat label="Po termínu" value={String(overdue)} note="úkoly po deadline" bad={overdue>0}/></div>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Pracovní fronta</h2><p>Vlastník vidí stav případu a průběžné zápisy bez nutnosti obvolávat správce.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Úkol</th><th>Nemovitost</th><th>Typ</th><th>Odpovědný</th><th>Termín</th><th>Priorita</th><th>Stav</th><th></th></tr></thead><tbody>
      {tasks.length ? tasks.map((task)=><NavigableTableRow href={`/ukoly/${task.id}`} ariaLabel={`Otevřít úkol ${task.title}`} key={task.id}><td><strong>{task.title}</strong><span className="owner-sub">{task.tenant?.name || `${task._count.entries} záznamů ve vlákně`}</span></td><td><Link className="entity-link" href={`/nemovitosti/${task.propertyId}/prehled`}>{task.property.name}</Link><span className="owner-sub">{task.unit?.label || "Celý objekt"}</span></td><td>{taskCategories[task.category]}</td><td>{task.assignee?.name || "Nepřiřazen"}</td><td>{task.dueAt ? date(task.dueAt) : "—"}</td><td><span className={`status ${task.priority==="URGENT"?"bad":task.priority==="HIGH"?"warn":""}`}>{taskPriorities[task.priority]}</span></td><td><span className={`status ${task.status==="DONE"?"ok":task.status==="WAITING"?"warn":task.status==="CANCELLED"?"":"bad"}`}>{taskStatuses[task.status]}</span></td><td><Link className="table-link" href={`/ukoly/${task.id}`}>Otevřít vlákno</Link></td></NavigableTableRow>) : <tr><td colSpan={8} className="table-empty">Žádné úkoly pro zvolený filtr.</td></tr>}
      </tbody></table></div>
    </div>
  </div></Shell>;
}
function MiniStat({label,value,note,bad=false}:{label:string;value:string;note:string;bad?:boolean}){return <div className="card stat"><div><span>{label}</span><strong className={bad?"negative":""}>{value}</strong><small className={bad?"bad":""}>{note}</small></div></div>}
