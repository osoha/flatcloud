import { redirect } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { AdminSubnav } from "@/components/admin/AdminSubnav";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { previewTaskAutomation } from "@/lib/task-automation";
import { taskPriorities } from "@/lib/labels";

export const dynamic="force-dynamic";
const runnable=new Set(["LEASE_EXPIRY","LEASE_ANNIVERSARY","LEASE_TERMINATION"]);

export default async function TaskAutomationAdmin({searchParams}:{searchParams:Promise<{ok?:string;error?:string}>}){
  const user=await requireUser();if(user.role!=="SUPER_ADMIN")redirect("/portfolio");const query=await searchParams;
  const [rules,candidates]=await Promise.all([prisma.taskAutomationRule.findMany({include:{_count:{select:{overrides:true,tasks:true}}},orderBy:[{globalEnabled:"desc"},{name:"asc"}]}),previewTaskAutomation()]);
  const candidateCount=new Map<string,number>();for(const candidate of candidates)candidateCount.set(candidate.ruleId,(candidateCount.get(candidate.ruleId)||0)+1);
  return <Shell user={user}><div className="page automation-admin-page"><div className="page-title"><div><PageHeading>Automatické úkoly</PageHeading><p>Globální katalog, výchozí stav domů a místní výjimky. Vypnutí nemaže již vytvořené úkoly.</p></div><form action="/api/admin/task-automation/run" method="post"><button className="primary" type="submit">Spustit bezpečný běh</button></form></div><AdminSubnav active="automation"/><Flash ok={query.ok} error={query.error}/><div className="notice"><strong>Bez dvojí evidence</strong><span>Spouštěč používá stabilní klíč smlouvy a rozhodného data. Opakovaný nebo souběžný běh nevytvoří druhý úkol. Finanční výpočty, párování ani vyúčtování vypínač neovlivňuje.</span></div><div className="automation-rule-list">{rules.map(rule=>{const live=runnable.has(rule.event);return <form className="card automation-rule-card" id={rule.id} action={`/api/admin/task-automation/${rule.id}`} method="post" key={rule.id}><div className="card-head"><div><span className={`status ${rule.globalEnabled?"ok":""}`}>{rule.globalEnabled?"Globálně povoleno":"Globálně vypnuto"}</span><h2>{rule.name}</h2><p>{rule.description}</p></div><span className={`status ${live?"ok":"warn"}`}>{live?"Aktivní spouštěč":"Připravený katalog"}</span></div><div className="automation-rule-stats"><span>{candidateCount.get(rule.id)||0} kandidátů nyní</span><span>{rule._count.tasks} vytvořených úkolů</span><span>{rule._count.overrides} místních výjimek</span></div><div className="form-grid"><label className="checkbox-field"><input name="globalEnabled" type="checkbox" defaultChecked={rule.globalEnabled} disabled={!live}/><span>Povolit pravidlo v systému</span></label><label className="checkbox-field"><input name="defaultEnabled" type="checkbox" defaultChecked={rule.defaultEnabled}/><span>Výchozí stav pro domy</span></label><label className="field"><span>Předstih / zpoždění ve dnech</span><input name="leadDays" type="number" min={0} max={365} defaultValue={rule.leadDays}/></label><label className="field"><span>Priorita</span><select name="priority" defaultValue={rule.priority}>{Object.entries(taskPriorities).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>{!live&&<input type="hidden" name="globalEnabled" value={rule.globalEnabled?"on":""}/>}<div className="automation-template"><strong>Text úkolu</strong><p>{rule.templateBody}</p></div><div className="form-actions"><button className="secondary" type="submit">Uložit pravidlo</button></div></form>})}</div></div></Shell>;
}
