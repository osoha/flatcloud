import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, FileText, Home, UserRound } from "lucide-react";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess, taskAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { dateInput } from "@/lib/forms";
import { taskCategories, taskEntryKinds, taskPriorities, taskStatuses } from "@/lib/labels";
import { overdueDebtCents } from "@/lib/charges";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { UserAvatar } from "@/components/UserAvatar";
import { TaskThreadComposer } from "@/components/TaskThreadComposer";
import { documentAccessWhere } from "@/lib/documents/access";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";
import { canEditTask, taskEntryVisibilityWhere } from "@/lib/task-access";
import { TaskReadMarker } from "@/components/TaskReadMarker";
import { TaskAttachments } from "@/components/TaskAttachments";

export const dynamic = "force-dynamic";

export default async function TaskDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}){
  const user=await requireUser();
  const {id}=await params;
  const query=await searchParams;
  const task=await prisma.task.findFirst({where:{id,...taskAccessWhere(user)},include:{property:true,unit:true,lease:{include:{charges:{where:{active:true},include:{allocations:true,securityDepositOffsets:true,creditApplications:true}}}},tenant:true,assignee:true,createdBy:true,members:{include:{user:true},orderBy:{createdAt:"asc"}},userStates:{where:{userId:user.id}},conditionPlanExecution:true,costs:{select:{id:true,title:true}},entries:{where:taskEntryVisibilityWhere(user),include:{author:true},orderBy:{createdAt:"desc"}}}});
  if(!task)notFound();
  const property=task.propertyId?await requirePropertyAccess(user,task.propertyId):null;
  if(task.propertyId&&!property)notFound();
  const propertyWide=Boolean(property&&(hasAllPropertyAccess(user)||property.memberships.some((row)=>row.userId===user.id)));
  if(property&&!propertyWide&&(!task.unitId||!property.units.some((unit)=>unit.id===task.unitId)))notFound();
  const canManage=await canEditTask(user,task);
  const [documents,taskAttachments]=await Promise.all([task.propertyId?prisma.document.findMany({where:{AND:[documentAccessWhere(user),{taskId:id}]},orderBy:{createdAt:"desc"},include:{fileAsset:true,property:{select:{name:true}},unit:{select:{label:true}},lease:{select:{contractNumber:true}},task:{select:{title:true}},complianceRecord:{select:{id:true}}}}):Promise.resolve([]),!task.propertyId?prisma.taskAttachment.findMany({where:{taskId:id},orderBy:{createdAt:"desc"},include:{fileAsset:true}}):Promise.resolve([])]);
  const managers=canManage?await prisma.user.findMany({where:task.propertyId?{active:true,OR:[{allProperties:true},{role:{in:["SUPER_ADMIN","MANAGER"]}},{memberships:{some:{propertyId:task.propertyId,permission:{in:["EDIT","ADMIN"]}}}}]}:{active:true},orderBy:{name:"asc"}}):[];
  const debt=task.lease?.charges.reduce((sum,charge)=>sum+overdueDebtCents(charge),0)??0;
  const latestPromise=task.entries.find((entry)=>entry.kind==="PROMISE");
  const promiseDate=latestPromise?.promisedPaymentDate||task.lease?.promisedPaymentDate||null;
  const promiseAmount=latestPromise?.promisedAmountCents||task.lease?.promisedAmountCents||null;
  const lastActivity=task.entries[0]?.createdAt||task.updatedAt;
  const statusLabel=taskStatuses[task.status];

  return <Shell user={user} taskPropertyId={task.propertyId||undefined} taskLeaseId={task.leaseId||undefined}><div className="page task-case-page">
    <TaskReadMarker taskId={task.id}/>
    <div className="breadcrumb"><Link href="/ukoly">Úkoly</Link><span>›</span>{task.property?<><Link href={`/nemovitosti/${task.propertyId}/prehled`}>{task.property.name}</Link><span>›</span></>:<><span>Obecné týmové vlákno</span><span>›</span></>}<span>{task.title}</span></div>
    <div className="page-title case-title"><div><PageHeading>{task.title}</PageHeading><div className="case-context">{task.property?<Link href={`/nemovitosti/${task.propertyId}/prehled`}><Home size={13}/>{task.property.name}</Link>:<span><UserRound size={13}/>Obecné týmové vlákno</span>}{task.unit&&<Link href={`/nemovitosti/${task.propertyId}/jednotky/${task.unit.id}`}>{task.unit.label}</Link>}{task.tenant&&<Link href={`/najemnici/${task.tenant.id}`}><UserRound size={13}/>{task.tenant.name}</Link>}{task.lease&&<Link href={`/smlouvy/${task.lease.id}`}><FileText size={13}/>{task.lease.contractNumber||`VS ${task.lease.variableSymbol}`}</Link>}</div></div><span className={`status large-status ${task.status==="DONE"?"ok":task.status==="WAITING"?"warn":"bad"}`}>{statusLabel}</span></div>
    <Flash ok={query.ok} error={query.error}/>

    <div className="detail-grid case-layout">
      <div className="card col-8 case-thread-card">
        <div className="card-head"><div><h2>Vlákno případu</h2><p className="muted-copy">Nejnovější komunikace a automatické události jsou nahoře. Vlastník vidí pouze záznamy označené jako viditelné vlastníkovi.</p></div></div>
        {!task.propertyId&&taskAttachments.some(attachment=>!attachment.taskEntryId)&&<div className="case-description"><strong>Přílohy zadání</strong><TaskAttachments attachments={taskAttachments.filter(attachment=>!attachment.taskEntryId)}/></div>}
        <div className="discussion-thread">{task.entries.length?task.entries.map((entry)=>{const entryDocuments=documents.filter(document=>document.taskEntryId===entry.id),entryAttachments=taskAttachments.filter(attachment=>attachment.taskEntryId===entry.id);return <article className={`discussion-entry kind-${entry.kind.toLowerCase()}`} id={`zaznam-${entry.id}`} key={entry.id}>
          <div className="discussion-avatar">{entry.author?<UserAvatar user={entry.author} size="sm"/>:<div className="system-avatar">FC</div>}</div>
          <div className="discussion-content"><div className="discussion-head"><div><strong>{entry.author?.name||"FlatCloud"}</strong><span className="entry-kind">{taskEntryKinds[entry.kind]}</span><span className="entry-kind">{entry.visibility==="INTERNAL"?"Interní":"Viditelné vlastníkovi"}</span></div><time>{entry.createdAt.toLocaleString("cs-CZ",{dateStyle:"medium",timeStyle:"short"})} · <Link href={`/ukoly/${task.id}#zaznam-${entry.id}`}>odkaz</Link></time></div><p>{entry.body}</p>{entryDocuments.length>0&&<DocumentAttachments documents={entryDocuments}/>}<TaskAttachments attachments={entryAttachments}/> {entry.kind==="PROMISE"&&(entry.promisedPaymentDate||entry.promisedAmountCents)&&<div className="promise-summary"><Clock3 size={15}/><div><strong>Příslib úhrady</strong><span>{entry.promisedPaymentDate?date(entry.promisedPaymentDate):"Datum neuvedeno"}{entry.promisedAmountCents?` · ${money(entry.promisedAmountCents)}`:""}</span></div></div>}</div>
        </article>}):<div className="table-empty">Vlákno zatím neobsahuje záznamy.</div>}</div>
        {canManage&&<TaskThreadComposer key={task.status} taskId={task.id} collection={task.category==="COLLECTION"} allowPromise={!task.conditionPlanExecution&&!(["DONE","CANCELLED"] as string[]).includes(task.status)}/>}
      </div>

      <aside className="col-4 stack-column case-sidebar">
        <div className="card case-summary-card"><div className="card-head"><h2>Stav případu</h2>{task.status==="DONE"&&<CheckCircle2 size={18} className="positive"/>}</div><div className="summary-list">
          <div><span>Stav</span><strong>{statusLabel}</strong></div>
          {task.category==="COLLECTION"&&<div><span>Aktuální dluh po splatnosti</span><strong className={debt?"negative":"positive"}>{money(debt)}</strong></div>}
          {task.category==="COLLECTION"&&<div><span>Nájemník / jednotka</span><strong>{task.tenant?.name||"Bez vazby"}{task.unit?` · ${task.unit.label}`:""}</strong></div>}
          {task.lease&&<div><span>Smlouva / VS</span><strong>{task.lease.contractNumber||"Bez čísla"} · VS {task.lease.variableSymbol}</strong></div>}
          {promiseDate&&<div><span>Příslib úhrady</span><strong>{date(promiseDate)}{promiseAmount?` · ${money(promiseAmount)}`:""}</strong></div>}
          <div><span>Odpovědný</span><strong>{task.assignee?.name||"Nepřiřazen"}</strong></div>
          <div><span>Termín</span><strong>{task.dueAt?date(task.dueAt):"Bez termínu"}</strong></div>
          <div><span>Poslední aktivita</span><strong>{lastActivity.toLocaleString("cs-CZ",{dateStyle:"short",timeStyle:"short"})}</strong></div>
          <div><span>Kategorie / priorita</span><strong>{taskCategories[task.category]} · {taskPriorities[task.priority]}</strong></div>
        </div>{task.description&&<div className="case-description"><strong>Zadání</strong><p>{task.description}</p></div>}<div className="task-personal-actions"><form action={`/api/tasks/${task.id}/state`} method="post"><input type="hidden" name="action" value={task.userStates[0]?.favorite?"unfavorite":"favorite"}/><input type="hidden" name="returnTo" value={`/ukoly/${task.id}`}/><button className="secondary" type="submit">{task.userStates[0]?.favorite?"★ Oblíbený":"☆ Přidat do oblíbených"}</button></form><form action={`/api/tasks/${task.id}/state`} method="post"><input type="hidden" name="action" value={task.userStates[0]?.dismissedAt?"restore":"dismiss"}/><input type="hidden" name="returnTo" value={`/ukoly/${task.id}`}/><button className="secondary" type="submit">{task.userStates[0]?.dismissedAt?"Vrátit na hlavní stránku":"Už nezobrazovat na hlavní stránce"}</button></form></div></div>
        <div className="card"><h2>Účastníci</h2><div className="summary-list"><div><span>Vlastník vlákna</span><strong>{task.createdBy?.name||"FlatCloud"}</strong></div>{task.assignee&&<div><span>Odpovědný</span><strong>{task.assignee.name}</strong></div>}{task.members.map(member=><div key={member.userId}><span>{member.role==="COLLABORATOR"?"Spoluřešitel":"Sledující"}</span><strong>{member.user.name}</strong>{canManage&&<form action={`/api/tasks/${task.id}/members`} method="post"><input type="hidden" name="action" value="remove"/><input type="hidden" name="userId" value={member.userId}/><button className="table-link" type="submit">Odebrat</button></form>}</div>)}</div>{canManage&&<form className="compact-form" action={`/api/tasks/${task.id}/members`} method="post"><input type="hidden" name="action" value="add"/><label className="field"><span>Přidat účastníka</span><select name="userId" required defaultValue=""><option value="">Vyberte uživatele</option>{managers.filter(person=>person.id!==task.createdById&&person.id!==task.assigneeId&&!task.members.some(member=>member.userId===person.id)).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="field"><span>Role</span><select name="role"><option value="COLLABORATOR">Spoluřešitel</option><option value="WATCHER">Sledující</option></select></label><button className="secondary" type="submit">Přidat</button></form>}</div>
        {task.category==="MAINTENANCE"&&documents.some(document=>document.photoStage==="BEFORE"||document.photoStage==="AFTER")&&<div className="card"><h2>Fotodokumentace</h2><h3>Před opravou</h3><DocumentAttachments documents={documents.filter(document=>document.photoStage==="BEFORE")}/><h3>Po opravě</h3><DocumentAttachments documents={documents.filter(document=>document.photoStage==="AFTER")}/></div>}
        {canManage&&task.conditionPlanExecution&&task.unitId&&!(["DONE","CANCELLED"] as string[]).includes(task.status)&&<div className="card capex-task-control"><strong>Řízená CAPEX realizace</strong><p>Dokončení probíhá v technickém modulu, aby se současně zapsal skutečný náklad a odchylka.</p><Link className="primary" href={`/nemovitosti/${task.propertyId}/jednotky/${task.unitId}#kvalita`}>Otevřít Kvalitu a CAPEX</Link></div>}
        {canManage&&!task.conditionPlanExecution&&!(["DONE","CANCELLED"] as string[]).includes(task.status)&&<details className="card case-edit-panel"><summary>Uzavřít případ</summary><form className="compact-form" action={`/api/tasks/${task.id}/close`} method="post" encType="multipart/form-data"><label className="field"><span>Viditelnost závěru</span><select name="visibility" defaultValue="INTERNAL"><option value="INTERNAL">Interní</option><option value="OWNER_VISIBLE">Viditelné vlastníkovi</option></select></label><label className="field"><span>Závěrečný komentář *</span><textarea name="body" rows={4} required/></label><label className="field"><span>Fotografie / soubory</span><input name="files" type="file" multiple/></label><button className="primary" type="submit">Uzavřít případ</button></form></details>}

        {canManage&&<details className="card case-edit-panel"><summary>Upravit případ</summary><form className="compact-form" action={`/api/tasks/${task.id}`} method="post"><label className="field"><span>Název</span><input name="title" defaultValue={task.title}/></label>{task.conditionPlanExecution?<label className="field"><span>Stav</span><input type="hidden" name="status" value={task.status}/><strong>{taskStatuses[task.status]} · řízeno přes Kvalitu a CAPEX</strong></label>:<label className="field"><span>Stav</span><select name="status" defaultValue={task.status}>{Object.entries(taskStatuses).filter(([value])=>task.status==="DONE"||task.status==="CANCELLED"?value===task.status:value!=="DONE").map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}<label className="field"><span>Priorita</span><select name="priority" defaultValue={task.priority}>{Object.entries(taskPriorities).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Odpovědný</span><select name="assigneeId" defaultValue={task.assigneeId||""}><option value="">Nepřiřazen</option>{managers.map((m)=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label className="field"><span>Termín</span><input name="dueAt" type="date" defaultValue={dateInput(task.dueAt)}/></label><label className="field"><span>Popis</span><textarea name="description" rows={4} defaultValue={task.description||""}/></label><button className="primary" type="submit">Uložit změny</button></form></details>}
        {canManage&&!task.conditionPlanExecution&&(["DONE","CANCELLED"] as string[]).includes(task.status)&&<details className="card case-edit-panel"><summary>Znovu otevřít případ</summary><p>Historie uzavření zůstane zachována. Případ se vrátí mezi otevřené úkoly.</p><form className="compact-form" action={`/api/tasks/${task.id}/reopen`} method="post"><input type="hidden" name="expectedStatus" value={task.status}/><input type="hidden" name="expectedUpdatedAt" value={task.updatedAt.toISOString()}/><label className="field"><span>Důvod znovuotevření *</span><textarea name="reason" required rows={3}/></label><button className="primary" type="submit">Znovu otevřít případ</button></form></details>}
        {propertyWide&&task.propertyId&&task.costs.length>0&&<section className="card"><h2>Související náklady</h2>{task.costs.map(cost=><p key={cost.id}><Link href={`/nemovitosti/${task.propertyId}/naklady/${cost.id}`}>{cost.title}</Link></p>)}</section>}
      </aside>
    </div>
  </div></Shell>;
}
