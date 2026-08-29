import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, FileText, Home, UserRound } from "lucide-react";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
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
import { canEditTask } from "@/lib/task-access";

export const dynamic = "force-dynamic";

export default async function TaskDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}){
  const user=await requireUser();
  const {id}=await params;
  const query=await searchParams;
  const task=await prisma.task.findUnique({where:{id},include:{property:true,unit:true,lease:{include:{charges:{where:{active:true},include:{allocations:true,securityDepositOffsets:true,creditApplications:true}}}},tenant:true,assignee:true,createdBy:true,entries:{include:{author:true},orderBy:{createdAt:"desc"}}}});
  if(!task)notFound();
  const property=await requirePropertyAccess(user,task.propertyId);
  if(!property)notFound();
  const propertyWide=hasAllPropertyAccess(user)||property.memberships.some((row)=>row.userId===user.id);
  if(!propertyWide&&(!task.unitId||!property.units.some((unit)=>unit.id===task.unitId)))notFound();
  const canManage=await canEditTask(user,task);
  const documents=await prisma.document.findMany({where:{AND:[documentAccessWhere(user),{taskId:id}]},orderBy:{createdAt:"desc"},include:{fileAsset:true,property:{select:{name:true}},unit:{select:{label:true}},lease:{select:{contractNumber:true}},task:{select:{title:true}},complianceRecord:{select:{id:true}}}});
  const managers=canManage?await prisma.user.findMany({where:{active:true,OR:[{allProperties:true},{role:{in:["SUPER_ADMIN","MANAGER"]}},{memberships:{some:{propertyId:task.propertyId,permission:{in:["EDIT","ADMIN"]}}}}]},orderBy:{name:"asc"}}):[];
  const debt=task.lease?.charges.reduce((sum,charge)=>sum+overdueDebtCents(charge),0)??0;
  const latestPromise=task.entries.find((entry)=>entry.kind==="PROMISE");
  const promiseDate=latestPromise?.promisedPaymentDate||task.lease?.promisedPaymentDate||null;
  const promiseAmount=latestPromise?.promisedAmountCents||task.lease?.promisedAmountCents||null;
  const lastActivity=task.entries[0]?.createdAt||task.updatedAt;
  const statusLabel=task.category==="COLLECTION"&&task.status==="WAITING"?"Čeká na úhradu":taskStatuses[task.status];

  return <Shell user={user} taskPropertyId={task.propertyId} taskLeaseId={task.leaseId||undefined}><div className="page task-case-page">
    <div className="breadcrumb"><Link href="/ukoly">Úkoly</Link><span>›</span><Link href={`/nemovitosti/${task.propertyId}/prehled`}>{task.property.name}</Link><span>›</span><span>{task.title}</span></div>
    <div className="page-title case-title"><div><h1>{task.title}</h1><div className="case-context"><Link href={`/nemovitosti/${task.propertyId}/prehled`}><Home size={13}/>{task.property.name}</Link>{task.unit&&<Link href={`/nemovitosti/${task.propertyId}/jednotky/${task.unit.id}`}>{task.unit.label}</Link>}{task.tenant&&<Link href={`/najemnici/${task.tenant.id}`}><UserRound size={13}/>{task.tenant.name}</Link>}{task.lease&&<Link href={`/smlouvy/${task.lease.id}`}><FileText size={13}/>{task.lease.contractNumber||`VS ${task.lease.variableSymbol}`}</Link>}</div></div><span className={`status large-status ${task.status==="DONE"?"ok":task.status==="WAITING"?"warn":"bad"}`}>{statusLabel}</span></div>
    <Flash ok={query.ok} error={query.error}/>

    <div className="detail-grid case-layout">
      <div className="card col-8 case-thread-card">
        <div className="card-head"><div><h2>Vlákno případu</h2><p className="muted-copy">Nejnovější komunikace a automatické události jsou nahoře. Vlastník vidí stejný průběh v režimu pouze pro čtení.</p></div></div>
        <div className="discussion-thread">{task.entries.length?task.entries.map((entry)=><article className={`discussion-entry kind-${entry.kind.toLowerCase()}`} key={entry.id}>
          <div className="discussion-avatar">{entry.author?<UserAvatar user={entry.author} size="sm"/>:<div className="system-avatar">FC</div>}</div>
          <div className="discussion-content"><div className="discussion-head"><div><strong>{entry.author?.name||"FlatCloud"}</strong><span className="entry-kind">{taskEntryKinds[entry.kind]}</span></div><time>{entry.createdAt.toLocaleString("cs-CZ",{dateStyle:"medium",timeStyle:"short"})}</time></div><p>{entry.body}</p><DocumentAttachments documents={documents.filter(document=>document.taskEntryId===entry.id)}/>{entry.kind==="PROMISE"&&(entry.promisedPaymentDate||entry.promisedAmountCents)&&<div className="promise-summary"><Clock3 size={15}/><div><strong>Příslib úhrady</strong><span>{entry.promisedPaymentDate?date(entry.promisedPaymentDate):"Datum neuvedeno"}{entry.promisedAmountCents?` · ${money(entry.promisedAmountCents)}`:""}</span></div></div>}</div>
        </article>):<div className="table-empty">Vlákno zatím neobsahuje záznamy.</div>}</div>
        {canManage&&<TaskThreadComposer taskId={task.id} collection={task.category==="COLLECTION"}/>}
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
        </div>{task.description&&<div className="case-description"><strong>Zadání</strong><p>{task.description}</p></div>}</div>
        {task.category==="MAINTENANCE"&&documents.some(document=>document.photoStage==="BEFORE"||document.photoStage==="AFTER")&&<div className="card"><h2>Fotodokumentace</h2><h3>Před opravou</h3><DocumentAttachments documents={documents.filter(document=>document.photoStage==="BEFORE")}/><h3>Po opravě</h3><DocumentAttachments documents={documents.filter(document=>document.photoStage==="AFTER")}/></div>}
        {canManage&&!(["DONE","CANCELLED"] as string[]).includes(task.status)&&<details className="card case-edit-panel"><summary>Uzavřít případ</summary><form className="compact-form" action={`/api/tasks/${task.id}/close`} method="post" encType="multipart/form-data"><label className="field"><span>Závěrečný komentář *</span><textarea name="body" rows={4} required/></label><label className="field"><span>Fotografie / soubory</span><input name="files" type="file" multiple/></label><button className="primary" type="submit">Uzavřít případ</button></form></details>}

        {canManage&&<details className="card case-edit-panel"><summary>Upravit případ</summary><form className="compact-form" action={`/api/tasks/${task.id}`} method="post"><label className="field"><span>Název</span><input name="title" defaultValue={task.title}/></label><label className="field"><span>Stav</span><select name="status" defaultValue={task.status}>{Object.entries(taskStatuses).filter(([value])=>task.status==="DONE"||task.status==="CANCELLED"?value===task.status:value!=="DONE").map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Priorita</span><select name="priority" defaultValue={task.priority}>{Object.entries(taskPriorities).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Odpovědný</span><select name="assigneeId" defaultValue={task.assigneeId||""}><option value="">Nepřiřazen</option>{managers.map((m)=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label className="field"><span>Termín</span><input name="dueAt" type="date" defaultValue={dateInput(task.dueAt)}/></label><label className="field"><span>Popis</span><textarea name="description" rows={4} defaultValue={task.description||""}/></label><button className="primary" type="submit">Uložit změny</button></form></details>}
      </aside>
    </div>
  </div></Shell>;
}
