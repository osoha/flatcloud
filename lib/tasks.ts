import { TaskEntryKind, TaskPriority, type Prisma } from "@prisma/client";
import { prisma } from "./db";
import { money } from "./format";
import { openTaskStatuses } from "./operations";
import { overdueDebtCents } from "./charges";

function displayPeriod(period: string) {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return period;
  return `${Number(m[2])}/${m[1].slice(2)}`;
}

export async function ensureCollectionTask(input: {
  leaseId: string;
  period: string;
  outstandingCents: number;
  event: string;
  kind?: TaskEntryKind;
  priority?: TaskPriority;
}) {
  const lease = await prisma.lease.findUnique({
    where: { id: input.leaseId },
    include: { tenant: true, unit: { include: { property: true } } },
  });
  if (!lease) return null;
  const dedupeKey = `collection:${lease.id}:${input.period}`;
  const title = `Upomínka ${displayPeriod(input.period)} · ${lease.unit.label} · ${lease.tenant.name}`;
  const description = `Pracovní vlákno k neuhrazenému nájemnému. Aktuální evidovaný dluh při založení / poslední automatické aktualizaci: ${money(input.outstandingCents)}.`;
  let task = await prisma.task.findUnique({ where: { dedupeKey } });
  if (!task) {
    task = await prisma.task.create({
      data: {
        title,
        description,
        category: "COLLECTION",
        status: "IN_PROGRESS",
        priority: input.priority || "HIGH",
        propertyId: lease.unit.propertyId,
        unitId: lease.unitId,
        leaseId: lease.id,
        tenantId: lease.tenantId,
        assigneeId: lease.unit.property.managerId || undefined,
        dedupeKey,
        entries: { create: { kind: "SYSTEM", body: `Úkol byl automaticky založen kvůli neuhrazenému předpisu ${input.period}.` } },
      },
    });
    await prisma.auditLog.create({ data: { propertyId: lease.unit.propertyId, action: "COLLECTION_TASK_CREATED", entityType: "Task", entityId: task.id, details: { leaseId: lease.id, period: input.period, title } } });
  } else if (task.status === "DONE" || task.status === "CANCELLED") return task;
  await prisma.taskEntry.create({ data: { taskId: task.id, kind: input.kind || "SYSTEM", body: input.event } });
  return task;
}

export async function resolveCollectionTasksIfSettled(leaseId: string) {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { unit: { select: { propertyId: true } }, charges: { where: { active: true }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true } } },
  });
  if (!lease) return 0;
  const overdue = lease.charges.reduce((sum, charge) => sum + overdueDebtCents(charge), 0);
  if (overdue > 0) return 0;
  const tasks = await prisma.task.findMany({ where: { leaseId, category: "COLLECTION", status: { in: openTaskStatuses } }, select: { id: true } });
  for (const task of tasks) {
    await prisma.$transaction([
      prisma.task.update({ where: { id: task.id }, data: { status: "DONE", closedAt: new Date() } }),
      prisma.taskEntry.create({ data: { taskId: task.id, kind: "SYSTEM", body: "Dluh byl po spárování plateb vyrovnán. Úkol byl automaticky uzavřen." } }),
      prisma.auditLog.create({ data: { propertyId: lease.unit.propertyId, action: "COLLECTION_TASK_RESOLVED", entityType: "Task", entityId: task.id, details: { leaseId } } }),
    ]);
  }
  return tasks.length;
}

export async function reconcileCollectionTasksAfterPaymentCorrectionTx(tx:Prisma.TransactionClient,leaseIds:string[]){
  for(const leaseId of [...new Set(leaseIds)]){
    const lease=await tx.lease.findUnique({where:{id:leaseId},include:{tenant:true,unit:{include:{property:true}},charges:{where:{active:true},include:{allocations:true,securityDepositOffsets:true,creditApplications:true},orderBy:{dueDate:"asc"}},tasks:{where:{category:"COLLECTION"},orderBy:{createdAt:"desc"}}}});
    if(!lease)continue;
    const overdueCharges=lease.charges.filter(charge=>overdueDebtCents(charge)>0),overdue=overdueCharges.reduce((sum,charge)=>sum+overdueDebtCents(charge),0),open=lease.tasks.filter(task=>openTaskStatuses.includes(task.status));
    if(!overdue){for(const task of open){await tx.task.update({where:{id:task.id},data:{status:"DONE",closedAt:new Date()}});await tx.taskEntry.create({data:{taskId:task.id,kind:"SYSTEM",body:"Dluh byl po opravě přiřazení plateb vyrovnán. Úkol byl automaticky uzavřen."}});await tx.auditLog.create({data:{propertyId:lease.unit.propertyId,action:"COLLECTION_TASK_RESOLVED",entityType:"Task",entityId:task.id,details:{leaseId,reason:"PAYMENT_CORRECTION"}}})}continue}
    if(open.length)continue;
    let autoResolvedTaskId:string|undefined;
    for(const candidate of lease.tasks.filter(task=>task.status==="DONE")){const latestClose=await tx.auditLog.findFirst({where:{entityType:"Task",entityId:candidate.id,action:{in:["COLLECTION_TASK_RESOLVED","TASK_CLOSED","TASK_UPDATED"]}},orderBy:{createdAt:"desc"}});if(latestClose?.action==="COLLECTION_TASK_RESOLVED"){autoResolvedTaskId=candidate.id;break}}
    if(autoResolvedTaskId){const task=await tx.task.update({where:{id:autoResolvedTaskId},data:{status:"IN_PROGRESS",closedAt:null,priority:"HIGH"}});await tx.taskEntry.create({data:{taskId:task.id,kind:"SYSTEM",body:"Po opravě přiřazení platby se znovu objevil dluh po splatnosti."}});await tx.auditLog.create({data:{propertyId:lease.unit.propertyId,action:"COLLECTION_TASK_REOPENED_AFTER_PAYMENT_CORRECTION",entityType:"Task",entityId:task.id,details:{leaseId,outstandingCents:overdue}}});continue}
    const title=`Obnovený dluh po opravě platby · ${lease.unit.label} · ${lease.tenant.name}`,task=await tx.task.create({data:{title,description:`Po opravě přiřazení / stornu platby se znovu objevila pohledávka po splatnosti ${money(overdue)}.`,category:"COLLECTION",status:"IN_PROGRESS",priority:"HIGH",propertyId:lease.unit.propertyId,unitId:lease.unitId,leaseId:lease.id,tenantId:lease.tenantId,assigneeId:lease.unit.property.managerId||undefined,entries:{create:{kind:"SYSTEM",body:"Po opravě přiřazení / stornu platby se znovu objevila pohledávka po splatnosti."}}}});await tx.auditLog.create({data:{propertyId:lease.unit.propertyId,action:"COLLECTION_TASK_CREATED_AFTER_PAYMENT_CORRECTION",entityType:"Task",entityId:task.id,details:{leaseId,period:overdueCharges[0]?.period,outstandingCents:overdue}}})
  }
}
