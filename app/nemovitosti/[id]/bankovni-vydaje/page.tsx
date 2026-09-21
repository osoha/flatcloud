import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasAllPropertyAccess, requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { PageHeading } from "@/components/PageHeading";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";
import { BankExpenseForm } from "@/components/BankExpenseForm";
import { bankRemainder, expenseKinds, settledCents, type ExpenseKind } from "@/lib/bank-expense-values";
import { date, moneyExact } from "@/lib/format";
import { businessDateKeyToInstant, businessDateEndInstant } from "@/lib/calendar";

export const dynamic="force-dynamic";
export default async function BankExpenses({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{year?:string;ok?:string;error?:string;state?:string;page?:string}>}) {
  const {id}=await params,user=await requireUser(),query=await searchParams;
  const property=await requirePropertyAccess(user,id);
  const membership=property?.memberships.find(m=>m.userId===user.id);
  if(!property||(!hasAllPropertyAccess(user)&&!membership))notFound();
  const canManage=hasAllPropertyAccess(user)||membership?.permission==="EDIT"||membership?.permission==="ADMIN";
  const rawYear=Number(query.year),year=Number.isInteger(rawYear)&&rawYear>=2000&&rawYear<=2100?rawYear:new Date().getFullYear();
  const from=businessDateKeyToInstant(`${year}-01-01`),to=businessDateEndInstant(`${year}-12-31`);
  const rows=await prisma.bankTransaction.findMany({where:{bankAccount:{propertyId:id},bookedAt:{gte:from,lte:to},OR:[{amountCents:{lt:0}},{source:"expense-statement"}]},include:{bankAccount:true,expenseAllocations:{include:{propertyCost:{select:{title:true}}},orderBy:{createdAt:"asc"}}},orderBy:[{bookedAt:"desc"},{id:"asc"}]});
  const targets=canManage?await prisma.property.findMany({where:{active:true,...(hasAllPropertyAccess(user)?{}:{memberships:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}})},select:{id:true,name:true,units:{select:{id:true,label:true}},costs:{where:{status:{in:["COMMITTED","ACTUAL"]}},include:{bankSettlements:true},orderBy:{effectiveAt:"desc"}}},orderBy:{name:"asc"}}):[];
  const targetData=targets.map(t=>({...t,costs:t.costs.map(c=>({id:c.id,title:c.title,documentNumber:c.documentNumber,remaining:c.amountCents-settledCents(c.bankSettlements)}))}));
  const readableTargets=new Set((await prisma.property.findMany({where:hasAllPropertyAccess(user)?{}:{memberships:{some:{userId:user.id}}},select:{id:true}})).map(p=>p.id));
  const authors=new Map((await prisma.user.findMany({where:{id:{in:rows.flatMap(r=>r.expenseAllocations.flatMap(a=>[a.createdById,...(a.voidedById?[a.voidedById]:[])]))}},select:{id:true,name:true}})).map(u=>[u.id,u.name]));
  const outgoing=rows.filter(r=>r.amountCents<0).reduce((s,r)=>s-r.amountCents,0),incoming=rows.filter(r=>r.amountCents>0).reduce((s,r)=>s+r.amountCents,0);
  const remainder=rows.reduce((s,r)=>s+bankRemainder(r.amountCents,r.expenseAllocations),0);
  const allocated=rows.flatMap(r=>r.expenseAllocations.filter(a=>!a.voidedAt));
  const filtered=query.state==="open"?rows.filter(r=>bankRemainder(r.amountCents,r.expenseAllocations)>0):rows;
  const pageCount=Math.max(1,Math.ceil(filtered.length/50));
  const pageIndex=Math.min(pageCount,Math.max(1,Number.parseInt(query.page||"1",10)||1));
  const visible=filtered.slice((pageIndex-1)*50,pageIndex*50);
  const pageHref=(page:number)=>`/nemovitosti/${id}/bankovni-vydaje?year=${year}&state=${query.state==="open"?"open":"all"}&page=${page}`;
  return <Shell user={user} taskPropertyId={id}><div className="page">
    <div className="breadcrumb"><Link href={`/nemovitosti/${id}/finance`}>{property.name} · Náklady a úvěry</Link><span>›</span><span>Bankovní výdaje</span></div>
    <div className="page-title"><div><PageHeading>Bankovní výdaje a úhrady</PageHeading><p>{property.name} · skutečné pohyby podle data bankovní úhrady</p></div><Link className="secondary" href={`/nemovitosti/${id}/finance#naklady`}>Evidence nákladů</Link></div>
    <PropertySubnav propertyId={id} active="finance" unitLimited={false}/><Flash ok={query.ok} error={query.error}/>
    <p className="notice">Přehled obsahuje importované pohyby účtů tohoto domu. Úplnost ověřte proti bankovnímu výpisu. Stav Skutečnost potvrzuje vznik nákladu; zaplacení dokládají až úhrady. NOI a výhled cashflow nadále vycházejí z evidence nákladů.</p>
    <form method="get" className="form-grid card"><label className="field"><span>Rok úhrady</span><input aria-label="Rok úhrady" name="year" type="number" min="2000" max="2100" defaultValue={year}/></label><label className="field"><span>Zobrazení</span><select name="state" defaultValue={query.state||"all"}><option value="all">Všechny pohyby</option><option value="open">Jen nerozdělené</option></select></label><div className="form-actions field-full"><button className="secondary">Zobrazit</button></div></form>
    <section className="card"><h2>Kontrola výpisu {year}</h2><div className="summary-list"><div><span>Odchozí pohyby</span><strong>{moneyExact(outgoing)}</strong></div><div><span>Importované příchozí vratky / jiné pohyby</span><strong>{moneyExact(incoming)}</strong></div><div><span>Čistý odtok</span><strong>{moneyExact(outgoing-incoming)}</strong></div><div><span>Nerozděleno (oba směry)</span><strong>{moneyExact(remainder)}</strong></div>{Object.entries(expenseKinds).map(([kind,label])=><div key={kind}><span>{label}</span><strong>{moneyExact(allocated.filter(a=>a.kind===kind).reduce((s,a)=>s+a.amountCents,0))}</strong></div>)}</div><p>Souhrn zahrnuje celý rok i při filtru nerozdělených pohybů. Převody, zálohy a jistina nevytvářejí provozní náklad. Sdílený účet může obsahovat úhrady více domů.</p></section>
    {canManage&&<details className="card"><summary>Importovat výdaje a vratky z CSV</summary><p><a className="secondary" href="/templates/bankovni-vydaje.csv" download>Stáhnout prázdnou CSV šablonu</a></p><p>Vyberte účet přiřazený k domu. CSV v UTF-8 se středníkem: <code>id;datum;castka;mena;protistrana;ucet;vs;zprava</code>. Datum YYYY-MM-DD, výdaj záporně, vratka kladně, měna CZK. ID musí být stabilní bankovní identifikátor, nikoli číslo řádku. Soubor obsahuje pouze výdaje a vratky dodavatelů; příjmy nájemného sem nepatří.</p><p>Bankovní e-mail zpracovává příchozí nájemné, úplný zdroj odchozích pohybů tím není zajištěn. Jeden pohyb importujte jedním zdrojem. Již evidované výdaje jiného konektoru znovu do CSV nezařazujte.</p><form action={`/api/properties/${id}/bank-expenses/import`} method="post" encType="multipart/form-data" className="form-grid"><label className="field"><span>Účet vlastníka</span><select name="accountId" required defaultValue=""><option value="" disabled>Vyberte účet</option>{property.paymentAccounts.map(link=><option key={link.id} value={link.ownerBankAccountId}>{link.ownerBankAccount.label||link.ownerBankAccount.iban||`${link.ownerBankAccount.accountNumber}/${link.ownerBankAccount.bankCode}`}</option>)}</select></label><label className="field"><span>CSV výpis</span><input name="file" type="file" accept=".csv,text/csv" required/></label><label className="field-full"><input name="confirmed" type="checkbox" required/> Ověřil jsem účet, stabilní ID, znaménka a vyloučení příjmů nájemného i pohybů již importovaných jiným zdrojem.</label><div className="form-actions"><button className="primary">Importovat CSV</button></div></form></details>}
    <section className="card"><h2>Pohyby ({filtered.length})</h2><p>Strana {pageIndex} z {pageCount} · nejvýše 50 pohybů na stránce.</p><div className="form-actions">{pageIndex>1&&<Link className="secondary" href={pageHref(pageIndex-1)}>Předchozí</Link>}{pageIndex<pageCount&&<Link className="secondary" href={pageHref(pageIndex+1)}>Další</Link>}</div>{!visible.length&&<p>Pro vybrané období nejsou žádné pohyby.</p>}{visible.map(r=>{const left=bankRemainder(r.amountCents,r.expenseAllocations);return <details key={r.id} id={`pohyb-${r.id}`} className="card"><summary>{date(r.bookedAt)} · {r.counterpartyName||r.message||r.externalId} · {moneyExact(r.amountCents)} · {left?`zbývá ${moneyExact(left)}`:"Rozděleno"}</summary><p>{r.bankAccount.ibanMasked} · ID {r.externalId} · VS {r.variableSymbol||"—"} · {r.message} · zdroj {r.source === "expense-statement" ? "CSV výpis" : r.source}</p>
      {r.expenseAllocations.length>0&&<div className="table-wrap"><table><thead><tr><th>Zařazení / náklad</th><th>Částka</th><th>Historie</th><th>Oprava</th></tr></thead><tbody>{r.expenseAllocations.map(a=><tr key={a.id}><td>{expenseKinds[a.kind as ExpenseKind]}{a.propertyCost&&readableTargets.has(a.propertyId)&&<> · <Link href={`/nemovitosti/${a.propertyId}/naklady/${a.propertyCostId}`}>{a.propertyCost.title}</Link></>}</td><td>{moneyExact(a.amountCents)}</td><td>{date(a.createdAt)} · {authors.get(a.createdById)||"Uživatel"} · {readableTargets.has(a.propertyId)?a.reason:"Přiřazení jiného domu"}{a.voidedAt&&<p>Stornováno {date(a.voidedAt)}: {readableTargets.has(a.propertyId)?a.voidReason:"Oprava jiného domu"}</p>}</td><td>{canManage&&targetData.some(t=>t.id===a.propertyId)&&!a.voidedAt&&<form action={`/api/properties/${id}/bank-expenses/${r.id}`} method="post"><input type="hidden" name="revision" value={r.expenseRevision}/><input type="hidden" name="voidId" value={a.id}/><input type="hidden" name="targetPropertyId" value={a.propertyId}/><label>Důvod storna <input name="reason" required maxLength={2000}/></label><button className="secondary">Stornovat přiřazení</button></form>}</td></tr>)}</tbody></table></div>}
      {canManage&&left>0&&<BankExpenseForm sourceId={id} transactionId={r.id} revision={r.expenseRevision} remaining={left} incoming={r.amountCents>0} targets={targetData} vendor={r.counterpartyName||""}/>}
    </details>})}</section>
  </div></Shell>;
}
