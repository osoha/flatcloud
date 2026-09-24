import type { Prisma, TaskAutomationEvent, TaskAutomationRule } from "@prisma/client";
import { prisma } from "./db";
import { businessDateKey, businessDateKeyToInstant, businessTodayKey } from "./calendar";
import { effectiveLeaseEnd, leaseStatusAt } from "./lease-lifecycle-core";
import { nextLeaseAnniversary } from "./lease-alerts";

type Client = Prisma.TransactionClient | typeof prisma;
type RuleWithOverrides = TaskAutomationRule & { overrides: Array<{ propertyId: string; mode: "INHERIT" | "ENABLED" | "DISABLED" }> };
export type AutomationCandidate = { ruleId: string; ruleCode: string; ruleName: string; event: TaskAutomationEvent; propertyId: string; propertyName: string; leaseId: string; unitId: string; tenantId: string; title: string; eventDate: Date; eventKey: string; description: string; assigneeId: string | null };

export function effectiveAutomationEnabled(rule: Pick<TaskAutomationRule,"globalEnabled"|"defaultEnabled">, mode: "INHERIT"|"ENABLED"|"DISABLED" = "INHERIT") {
  return rule.globalEnabled && (mode === "ENABLED" || (mode === "INHERIT" && rule.defaultEnabled));
}

function addDays(date: Date, days: number) { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + days); return copy; }
function checklistText(value: Prisma.JsonValue | null) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item)=>`• ${item}`).join("\n") : ""; }

export async function previewTaskAutomation(now = new Date(), client: Client = prisma): Promise<AutomationCandidate[]> {
  const rules = await client.taskAutomationRule.findMany({ where: { globalEnabled: true }, include: { overrides: true } }) as RuleWithOverrides[];
  const supported = rules.filter((rule)=>["LEASE_EXPIRY","LEASE_ANNIVERSARY","LEASE_TERMINATION"].includes(rule.event));
  if (!supported.length) return [];
  const maxLead = Math.max(...supported.map((rule)=>rule.leadDays),0);
  const horizon = addDays(now,maxLead+2);
  const leases = await client.lease.findMany({
    where: { cancelledAt: null, unit: { property: { active: true } }, OR: [{ endDate: { lte: horizon } }, { terminatedOn: { lte: horizon } }, { startDate: { lte: horizon } }] },
    include: { tenant: true, unit: { include: { property: { select: { id:true,name:true,managerId:true } } } } },
  });
  const todayKey = businessTodayKey(now);
  const candidates: AutomationCandidate[] = [];
  for (const rule of supported) for (const lease of leases) {
    const property = lease.unit.property;
    const mode = rule.overrides.find((row)=>row.propertyId===property.id)?.mode || "INHERIT";
    if (!effectiveAutomationEnabled(rule,mode)) continue;
    let eventDate: Date | null = null;
    if (rule.event === "LEASE_EXPIRY" && leaseStatusAt(lease,now)==="ACTIVE") eventDate = effectiveLeaseEnd(lease);
    if (rule.event === "LEASE_ANNIVERSARY" && leaseStatusAt(lease,now)==="ACTIVE") {
      const anniversary = nextLeaseAnniversary(lease.startDate,now), end = effectiveLeaseEnd(lease);
      if (!end || businessDateKey(anniversary)<=businessDateKey(end)) eventDate=anniversary;
    }
    if (rule.event === "LEASE_TERMINATION" && lease.terminatedOn) eventDate=lease.terminatedOn;
    if (!eventDate) continue;
    const eventDateKey=businessDateKey(eventDate), triggerKey=businessDateKey(addDays(eventDate,-rule.leadDays));
    if (todayKey<triggerKey || eventDateKey<todayKey) continue;
    const eventKey=`${rule.code}:${lease.id}:${eventDateKey}`;
    const subject=`${lease.unit.label} · ${lease.tenant.name}`;
    const title=rule.event==="LEASE_EXPIRY"?`Konec nájmu se blíží · ${subject}`:rule.event==="LEASE_ANNIVERSARY"?`Výročí nájmu · ${subject}`:`Ukončení nájmu · ${subject}`;
    const checklist=checklistText(rule.checklist);
    candidates.push({ ruleId:rule.id,ruleCode:rule.code,ruleName:rule.name,event:rule.event,propertyId:property.id,propertyName:property.name,leaseId:lease.id,unitId:lease.unitId,tenantId:lease.tenantId,title,eventDate:businessDateKeyToInstant(eventDateKey),eventKey,description:`${rule.templateBody}${checklist?`\n\nChecklist:\n${checklist}`:""}`,assigneeId:property.managerId });
  }
  return candidates.sort((a,b)=>a.eventDate.getTime()-b.eventDate.getTime()||a.title.localeCompare(b.title,"cs"));
}

export async function runTaskAutomation(now = new Date(), client: Client = prisma) {
  const candidates = await previewTaskAutomation(now,client);
  let created=0,existing=0;
  for (const candidate of candidates) {
    const rule = await client.taskAutomationRule.findUniqueOrThrow({ where: { id: candidate.ruleId } });
    const dedupeKey=`automation:${candidate.eventKey}`;
    if(await client.task.findUnique({where:{dedupeKey},select:{id:true}})){existing++;continue;}
    try{await client.task.create({data:{ title:candidate.title,description:candidate.description,category:rule.category,priority:rule.priority,propertyId:candidate.propertyId,unitId:candidate.unitId,leaseId:candidate.leaseId,tenantId:candidate.tenantId,assigneeId:candidate.assigneeId||undefined,dueAt:candidate.eventDate,dedupeKey,automationRuleId:rule.id,automationEventKey:candidate.eventKey,entries:{create:{kind:"SYSTEM",body:`Úkol automaticky vytvořen pravidlem „${rule.name}“. Rozhodné datum: ${businessDateKey(candidate.eventDate)}.`}} }});created++;}catch(error){if(error&&typeof error==="object"&&"code" in error&&error.code==="P2002")existing++;else throw error;}
  }
  return { candidates:candidates.length,created,existing,summary:`Automatické úkoly: ${created} vytvořeno, ${existing} již existovalo, ${candidates.length} kandidátů.` };
}
