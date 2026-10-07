import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bankEditableUnitScope } from "@/lib/bank-account-permissions";
import { applyDueBankAccountChanges } from "@/lib/bank-account-changes";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { date } from "@/lib/format";
export const dynamic="force-dynamic";
export default async function BankChange({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}){
 const user=await requireUser(),{id}=await params;
 const change=await prisma.bankAccountChange.findFirst({where:{id,units:{some:{unit:bankEditableUnitScope(user)},every:{unit:bankEditableUnitScope(user)}}},include:{units:{include:{unit:{select:{label:true,property:{select:{name:true}}}}}},notices:{select:{id:true,title:true,body:true,pdfHash:true,announcementId:true,tenantIds:true,reads:true,createdAt:true}}}});
 if(!change)notFound();
 const [mails,tenants,tasks]=await Promise.all([prisma.tenantPortalNotification.findMany({where:{announcementId:{in:change.notices.map(n=>n.announcementId)}},select:{tenantId:true,status:true,detail:true,sentAt:true,announcementId:true}}),prisma.tenant.findMany({where:{id:{in:change.notices.flatMap(n=>n.tenantIds)}},select:{id:true,name:true}}),prisma.task.findMany({where:{dedupeKey:{in:change.notices.map(n=>`bank-notice:${n.id}`)}},select:{id:true,status:true,dedupeKey:true}})]);
 return <Shell user={user}><h1>Změna účtu pro nájemné</h1><Flash {...await searchParams}/><a href="/bankovni-ucty">← Bankovní účty</a><section className="card"><h2>{{SCHEDULED:"Naplánováno",APPLIED:"Účinné",CANCELLED:"Zrušeno",BLOCKED:"Vyžaduje kontrolu"}[change.status]||change.status} · od {date(change.effectiveAt)}</h2><p>{change.reason}</p>{change.failure&&<p className="notice">{change.failure}</p>}{change.units.map(u=><p key={u.unitId}>{u.unit.property.name} · {u.unit.label}</p>)}{["SCHEDULED","BLOCKED"].includes(change.status)&&<form action={`/api/bank-accounts/changes/${id}/cancel`} method="post"><label className="checkbox-field"><input type="checkbox" name="confirm" required/><span>Zrušit plánovanou změnu a oznámit její zrušení dotčeným nájemníkům.</span></label><button className="secondary" type="submit">Zrušit změnu a oznámit</button></form>}</section>
 {change.notices.map(n=><section className="card" key={n.id}><h2>{n.title}</h2><p style={{whiteSpace:"pre-line"}}>{n.body}</p><a className="secondary" href={`/api/bank-accounts/notices/${n.id}/pdf`}>Stáhnout uložené PDF</a><h3>Doručení a potvrzení</h3>{n.tenantIds.map(tid=>{const read=n.reads.find(r=>r.tenantId===tid),mail=mails.find(m=>m.announcementId===n.announcementId&&m.tenantId===tid);return <p key={tid}><strong>{tenants.find(t=>t.id===tid)?.name||"Nájemník"}</strong> · {read?.confirmedAt?`Potvrzeno přečtení ${date(read.confirmedAt)}`:read?.openedAt?"PDF otevřeno, přečtení nepotvrzeno":"Přečtení nepotvrzeno"} · E-mail: {mail?({SENT:"Odesláno",PENDING:"Čeká na odeslání",RETRY:"Čeká na opakování",FAILED:"Neodesláno",UNKNOWN:"Výsledek neznámý",SKIPPED:"Neodesláno",SENDING:"Odesílá se"}[mail.status]||mail.status):"Vyžaduje jiné doručení"}</p>})}{tasks.filter(t=>t.dedupeKey===`bank-notice:${n.id}`).map(t=><p key={t.id}><a href={`/ukoly/${t.id}`}>Úkol pro doručení a připojení dokladu</a> · {t.status}</p>)}<small>Odeslání e-mailu, otevření PDF a potvrzení přečtení se evidují samostatně.</small></section>)}
 </Shell>;
}
