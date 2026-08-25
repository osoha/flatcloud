import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { dateInput } from "@/lib/forms";
import { taskCategories, taskEntryKinds, taskPriorities, taskStatuses } from "@/lib/labels";
import { hasPropertyPermission } from "@/lib/management";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";

export const dynamic = "force-dynamic";
export default async function TaskDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}){
  const user=await requireUser(); const {id}=await params; const query=await searchParams;
  const task=await prisma.task.findUnique({where:{id},include:{property:true,unit:true,lease:{include:{charges:{where:{active:true},include:{allocations:true}}}},tenant:true,assignee:true,createdBy:true,entries:{include:{author:true},orderBy:{createdAt:"asc"}}}}); if(!task)notFound();
  const property=await requirePropertyAccess(user,task.propertyId); if(!property)notFound();
  const propertyWide=hasAllPropertyAccess(user)||property.memberships.some((row)=>row.userId===user.id); if(!propertyWide&&(!task.unitId||!property.units.some((unit)=>unit.id===task.unitId)))notFound();
  const canManage=await hasPropertyPermission(user,task.propertyId,"EDIT");
  const managers=await prisma.user.findMany({where:{active:true,OR:[{allProperties:true},{role:{in:["SUPER_ADMIN","MANAGER"]}},{memberships:{some:{propertyId:task.propertyId,permission:{in:["EDIT","ADMIN"]}}}}]},orderBy:{name:"asc"}});
  const outstanding=task.lease?.charges.reduce((sum,charge)=>sum+Math.max(0,charge.amountCents-charge.allocations.reduce((s,a)=>s+a.amountCents,0)),0)??0;
  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href="/ukoly">Úkoly</Link><span>›</span><span>{task.title}</span></div><div className="page-title"><div><h1>{task.title}</h1><p>{task.property.name}{task.unit?` · ${task.unit.label}`:""}{task.tenant?` · ${task.tenant.name}`:""}</p></div><span className={`status large-status ${task.status==="DONE"?"ok":task.status==="WAITING"?"warn":"bad"}`}>{taskStatuses[task.status]}</span></div><Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <div className="card col-8"><div className="card-head"><div><h2>Vlákno případu</h2><p className="muted-copy">Chronologický přehled komunikace a automatických událostí. Vlastník jej vidí v režimu pouze pro čtení.</p></div></div>
        <div className="timeline">{task.entries.length?task.entries.map((entry)=><div className={`timeline-entry kind-${entry.kind.toLowerCase()}`} key={entry.id}><div className="timeline-dot"/><div className="timeline-body"><div className="timeline-meta"><strong>{taskEntryKinds[entry.kind]}</strong><span>{entry.author?.name||"FlatCloud"} · {entry.createdAt.toLocaleString("cs-CZ")}</span></div><p>{entry.body}</p></div></div>):<div className="table-empty">Vlákno zatím neobsahuje záznamy.</div>}</div>
        {canManage&&<form className="thread-composer" action={`/api/tasks/${task.id}/entries`} method="post"><label className="field"><span>Typ záznamu</span><select name="kind" defaultValue="COMMENT"><option value="COMMENT">Poznámka</option><option value="CALL">Telefonát s nájemníkem</option><option value="EMAIL">E-mail / zpráva</option><option value="PROMISE">Příslib úhrady</option></select></label><label className="field"><span>Přislíbené datum (volitelně)</span><input name="promiseDate" type="date"/></label><label className="field"><span>Přislíbená částka (volitelně)</span><input name="promiseAmount" type="number" step="0.01" min="0"/></label><label className="field field-full"><span>Zápis do vlákna</span><textarea name="body" rows={4} required placeholder="Např. Nájemník telefonicky potvrdil úhradu do pátku 28. 8.; čekáme na platbu."/></label><div className="form-actions field-full"><button className="primary" type="submit">Přidat záznam</button></div></form>}
      </div>
      <div className="col-4 stack-column">
        <div className="card"><h2>Stav případu</h2><div className="summary-list"><div><span>Kategorie</span><strong>{taskCategories[task.category]}</strong></div><div><span>Priorita</span><strong>{taskPriorities[task.priority]}</strong></div><div><span>Odpovědný</span><strong>{task.assignee?.name||"Nepřiřazen"}</strong></div><div><span>Termín</span><strong>{task.dueAt?date(task.dueAt):"Bez termínu"}</strong></div>{task.category==="COLLECTION"&&<div><span>Aktuální dluh smlouvy</span><strong className={outstanding?"negative":"positive"}>{money(outstanding)}</strong></div>}{task.category==="COLLECTION"&&task.lease?.promisedPaymentDate&&<div><span>Příslib úhrady</span><strong>{date(task.lease.promisedPaymentDate)}{task.lease.promisedAmountCents?` · ${money(task.lease.promisedAmountCents)}`:""}</strong></div>}</div>{task.description&&<div className="notice" style={{marginTop:14}}>{task.description}</div>}</div>
        {canManage&&<form className="card compact-form" action={`/api/tasks/${task.id}`} method="post"><h2>Řízení úkolu</h2><label className="field"><span>Název</span><input name="title" defaultValue={task.title}/></label><label className="field"><span>Stav</span><select name="status" defaultValue={task.status}>{Object.entries(taskStatuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Priorita</span><select name="priority" defaultValue={task.priority}>{Object.entries(taskPriorities).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Odpovědný</span><select name="assigneeId" defaultValue={task.assigneeId||""}><option value="">Nepřiřazen</option>{managers.map((m)=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label className="field"><span>Termín</span><input name="dueAt" type="date" defaultValue={dateInput(task.dueAt)}/></label><label className="field"><span>Popis</span><textarea name="description" rows={4} defaultValue={task.description||""}/></label><button className="primary" type="submit">Uložit stav</button></form>}
      </div>
    </div>
  </div></Shell>
}
