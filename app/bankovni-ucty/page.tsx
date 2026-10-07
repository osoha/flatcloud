import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { BankVerificationPayment } from "@/components/BankVerificationPayment";
import { BankNotificationGuide } from "@/components/BankNotificationGuide";
import { BankAccountChangeForm } from "@/components/BankAccountChangeForm";
import { bankOwnerScope, bankAccountReadScope } from "@/lib/bank-account-permissions";
import { applyDueBankAccountChanges, changeableBankUnits, bankUnitRevision } from "@/lib/bank-account-changes";
import { ownerBankAccountLabel } from "@/lib/owner-bank-account";
import { verificationCodeForAccount } from "@/lib/bank-email-verification";
import { businessDateKey } from "@/lib/calendar";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { appSettings } from "@/lib/settings";

export const dynamic="force-dynamic";
export default async function BankAccounts({searchParams}:{searchParams:Promise<{unitId?:string;accountId?:string;ownerId?:string;ok?:string;error?:string}>}){
  const user=await requireUser(),query=await searchParams;
  const [units,accounts,owners,settings]=await Promise.all([
    changeableBankUnits(user),
    prisma.ownerBankAccount.findMany({where:bankAccountReadScope(user),include:{owner:{select:{name:true}}},orderBy:[{owner:{name:"asc"}},{createdAt:"asc"}]}),
    prisma.owner.findMany({where:{active:true,...bankOwnerScope(user)},select:{id:true,name:true},orderBy:{name:"asc"}}),appSettings(),
  ]);
  if(query.unitId&&!units.some(u=>u.id===query.unitId))notFound();
  const selected=units.find(u=>u.id===query.unitId),ownerId=selected?.ownerships[0]?.ownerId||query.ownerId;
  const changes=await prisma.bankAccountChange.findMany({where:{units:{some:{unitId:{in:units.map(u=>u.id)}},every:{unitId:{in:units.map(u=>u.id)}}}},select:{id:true,effectiveAt:true,status:true},orderBy:{createdAt:"desc"},take:25});
  return <Shell user={user}><div className="page-heading"><h1>{selected?`Účet pro nájemné · ${selected.label}`:"Moje bankovní účty"}</h1><p>Účet přidejte a ověřte jednou. Jeho použití si vyberete samostatně u jednotek.</p>{selected&&<Link href={`/nemovitosti/${selected.propertyId}/jednotky/${selected.id}`}>← Zpět na jednotku</Link>}</div><Flash ok={query.ok} error={query.error}/>
    <BankAccountChangeForm today={businessDateKey(new Date())} requestId={randomUUID()} initialUnitId={query.unitId} initialAccountId={query.accountId} accounts={accounts.map(a=>({id:a.id,ownerId:a.ownerId,label:`${a.owner.name} · ${ownerBankAccountLabel(a)}`,verified:Boolean(a.notificationVerifiedAt),available:a.active&&a.usageState==="AVAILABLE"}))} units={units.filter(u=>u.ownerships.length===1).map(u=>({id:u.id,ownerId:u.ownerships[0].ownerId,label:`${u.property.name} · ${u.label}`,accountLabel:u.ownerships[0].ownerBankAccount?ownerBankAccountLabel(u.ownerships[0].ownerBankAccount):"Nenastaven",revision:bankUnitRevision(u),leases:u.leases.filter(l=>leaseStatusAt(l)!=="ENDED").map(l=>({label:l.contractNumber||"Nájemní smlouva",tenants:[l.tenant.name,...l.parties.filter(p=>p.role==="CONTRACTING_PARTY").map(p=>p.tenant.name)].join(", ")}))}))}/>
    <section className="card" id="pridat-ucet"><h2>Přidat účet</h2><p>Přidání účtu nemění platební pokyny žádné jednotky.</p><form className="form-grid" action="/api/bank-accounts" method="post"><input type="hidden" name="returnUnitId" value={query.unitId||""}/><label className="field"><span>Vlastník účtu</span><select name="ownerId" defaultValue={ownerId} required><option value="">Vyberte vlastníka</option>{owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label className="field"><span>Název účtu</span><input name="label" maxLength={100} placeholder="Např. nájemné ČSOB"/></label><label className="field"><span>Číslo účtu</span><input name="accountNumber"/></label><label className="field"><span>Kód banky</span><input name="bankCode" inputMode="numeric" maxLength={4}/></label><label className="field"><span>IBAN (volitelný)</span><input name="iban"/></label><button className="primary" type="submit">Přidat a ověřit účet</button></form></section>
    <section className="card"><h2>Bankovní notifikace</h2><BankNotificationGuide mailbox={settings?.inboundMailUser||"platby@flatcloud.cz"} accountBankCodes={accounts.map(a=>a.bankCode||"")}/></section>
    {accounts.map(a=><section className="card" id={`ucet-${a.id}`} key={a.id}><h2>{a.owner.name} · {ownerBankAccountLabel(a)}</h2><p>{a.usageState==="ARCHIVED"?"Archivovaný":a.usageState==="RECEIPTS_ONLY"?"Pouze pro dobíhající platby":"Dostupný pro nové platební pokyny"}</p><BankVerificationPayment account={a} variableSymbol={verificationCodeForAccount(a.id)} units={units.filter(u=>u.ownerships.some(o=>o.ownerBankAccountId===a.id)).map(u=>`${u.property.name} · ${u.label}`)} verified={Boolean(a.notificationVerifiedAt)}/><form action={`/api/bank-accounts/${a.id}/check`} method="post"><button className="secondary" type="submit">Odeslal/a jsem testovací platbu – zkontrolovat</button></form><details><summary>Název a používání účtu</summary><form className="form-grid" action={`/api/bank-accounts/${a.id}`} method="post"><label className="field"><span>Název</span><input name="label" defaultValue={a.label||""} maxLength={100}/></label><label className="field"><span>Používání</span><select name="usageState" defaultValue={a.usageState}><option value="AVAILABLE">Dostupný</option><option value="RECEIPTS_ONLY">Pouze dobíhající platby</option><option value="ARCHIVED">Archivovaný</option></select></label><p>Číslo účtu zůstává v historii. Nové číslo přidejte jako nový účet.</p><button className="secondary" type="submit">Uložit</button></form></details></section>)}
    <section className="card"><h2>Historie změn účtů</h2>{changes.length?changes.map(c=><p key={c.id}><Link href={`/bankovni-ucty/zmeny/${c.id}`}>Účinnost {businessDateKey(c.effectiveAt)} · {{SCHEDULED:"Naplánováno",APPLIED:"Účinné",CANCELLED:"Zrušeno",BLOCKED:"Vyžaduje kontrolu"}[c.status]||c.status}</Link></p>):<p>Zatím žádná změna.</p>}</section>
  </Shell>;
}
