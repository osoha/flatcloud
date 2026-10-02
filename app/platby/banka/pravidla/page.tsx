import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser,hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bankAccountScopes,requireInboxBankAccess } from "@/lib/account-banking-access";
import { bankAccountMatches } from "@/lib/inbound-bank/bank-email";
import { samePhysicalBankAccount, ownerBankAccountLabel } from "@/lib/owner-bank-account";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { PageHeading } from "@/components/PageHeading";
import { money } from "@/lib/format";

export const dynamic="force-dynamic";
export default async function AccountRules({searchParams}:{searchParams:Promise<{account?:string;inbox?:string;ok?:string;error?:string}>}) {
  const user=await requireUser();const query=await searchParams;
  const accounts=await bankAccountScopes(user);
  if(query.account && !accounts.some(a=>a.id===query.account))notFound();
  const source=query.inbox?await requireInboxBankAccess(user,query.inbox).then(r=>r.row).catch(()=>notFound()):null;
  const selected=source?accounts.filter(a=>bankAccountMatches(a,source.recipientAccount)):query.account?accounts.filter(a=>samePhysicalBankAccount(a,accounts.find(b=>b.id===query.account))):accounts;
  const [rules,leases]=await Promise.all([
    prisma.accountBankRule.findMany({where:{ownerBankAccountId:{in:selected.map(a=>a.id)}},include:{ownerBankAccount:{include:{owner:true}},targetLease:{include:{tenant:true,unit:{include:{property:true}}}}},orderBy:[{priority:"asc"},{createdAt:"asc"}]}),
    prisma.lease.findMany({where:{ownerBankAccountId:{in:selected.map(a=>a.id)},...(hasAllPropertyAccess(user)?{}:{unit:{OR:[{property:{memberships:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}}},{userAccesses:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}}]}})},include:{tenant:true,unit:{include:{property:true}}},orderBy:{createdAt:"desc"}}),
  ]);
  const direction=source?.amountCents!=null && source.amountCents<0?"OUT":"IN";
  return <Shell user={user}><div className="page"><Flash {...query}/><div className="page-title"><div><PageHeading>Pravidla bankovních účtů</PageHeading><p>Pravidla platí pro konkrétní účet napříč domy. Použijí se na nové důvěryhodné notifikace; minulá zaúčtování zůstávají zachována.</p></div><Link className="secondary" href="/platby/banka">Bankovní pohyby</Link></div>
    <div className="card"><h2>{source?"Pravidlo ze zvoleného pohybu":"Nové pravidlo účtu"}</h2><p className="muted-copy">Všechny vyplněné podmínky musí odpovídat současně. Můžete odstranit proměnlivou částku nebo zprávu, ale ponechte alespoň jednu podmínku. Ignorování nevyžaduje přiřazení domu; párování vyžaduje konkrétní smlouvu.</p>
    {selected.some(a=>a.active)?<form className="account-bank-rule-form" action="/api/bank-account-rules" method="post"><input type="hidden" name="sourceId" value={source?.id||""}/>
      <label className="field"><span>Bankovní účet *</span><select name="accountId" required defaultValue={query.account||selected[0]?.id}>{selected.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.owner.name} · {ownerBankAccountLabel(a)}</option>)}</select></label>
      <label className="field"><span>Název pravidla *</span><input name="name" required maxLength={160} defaultValue={source?`Ignorovat · ${source.counterpartyName||source.message||"opakovaný pohyb"}`.slice(0,160):""}/></label>
      <label className="field"><span>Akce *</span><select name="action" defaultValue="IGNORE"><option value="IGNORE">Ignorovat pohyb</option><option value="MATCH_LEASE">Automaticky přiřadit ke smlouvě</option><option value="SUGGEST_LEASE">Pouze navrhnout smlouvu</option></select></label>
      <label className="field"><span>Směr pohybu *</span><select name="direction" defaultValue={direction}><option value="IN">Příchozí</option><option value="OUT">Odchozí</option></select></label>
      <label className="field"><span>Měna *</span><input name="currency" required pattern="[A-Z]{3}" maxLength={3} defaultValue={source?.currency||"CZK"}/></label>
      <label className="field"><span>Částka (volitelná)</span><input name="amount" type="number" min="0.01" step="0.01" defaultValue={source?.amountCents?(Math.abs(source.amountCents)/100).toFixed(2):""}/></label>
      <label className="field"><span>Účet protistrany</span><input name="counterpartyAccount" maxLength={100} defaultValue={source?.counterpartyAccount||""}/></label>
      <label className="field"><span>Název protistrany obsahuje</span><input name="counterpartyNameContains" maxLength={500} defaultValue={source?.counterpartyName||""}/></label>
      <label className="field"><span>Variabilní symbol</span><input name="variableSymbol" inputMode="numeric" maxLength={10} defaultValue={source?.variableSymbol||""}/></label>
      <label className="field"><span>Zpráva obsahuje</span><input name="messageContains" maxLength={500} defaultValue={(source?.message||"").slice(0,500)}/></label>
      <label className="field field-full"><span>Cílová smlouva (jen pro párování)</span><select name="targetLeaseId" defaultValue=""><option value="">Bez cílové smlouvy · ignorace</option>{leases.map(l=><option key={l.id} value={l.id}>{l.unit.property.name} · {l.unit.label} · {l.tenant.name} · VS {l.variableSymbol}</option>)}</select><small>Smlouva musí používat zvolený bankovní účet. Odchozí pohyby nelze započítávat na nájemné.</small></label>
      <button className="primary" type="submit">Uložit pravidlo účtu</button>
    </form>:<p>Nemáte dostupný aktivní účet pro vytvoření pravidla.</p>}</div>
    <div className="card portfolio-table-card" style={{marginTop:20}}><div className="table-toolbar"><h2>Uložená pravidla · {rules.length}</h2></div><div className="table-wrap"><table><thead><tr><th>Pravidlo / účet</th><th>Akce</th><th>Podmínky</th><th>Cíl</th><th>Stav</th><th></th></tr></thead><tbody>{rules.length?rules.map(r=><tr key={r.id}><td>{r.name}<small className="owner-sub">{ownerBankAccountLabel(r.ownerBankAccount)}</small></td><td>{r.action==="IGNORE"?"Ignorovat":r.action==="MATCH_LEASE"?"Párovat":"Navrhnout"}</td><td>{[r.direction==="IN"?"Příchozí":"Odchozí",r.currency,r.counterpartyAccount,r.counterpartyNameContains,r.variableSymbol&&`VS ${r.variableSymbol}`,r.messageContains,r.amountCents!=null&&money(Math.abs(r.amountCents))].filter(Boolean).join(" · ")}</td><td>{r.targetLease?`${r.targetLease.unit.property.name} · ${r.targetLease.unit.label} · ${r.targetLease.tenant.name}`:"Celý účet · bez přiřazení domu"}</td><td>{r.active?"Zapnuto":"Vypnuto"}</td><td><form action={`/api/bank-account-rules/${r.id}`} method="post"><input type="hidden" name="active" value={r.active?"0":"1"}/><button className="secondary">{r.active?"Vypnout":"Zapnout"}</button></form></td></tr>):<tr><td colSpan={6} className="table-empty">Zatím nemáte žádná pravidla pro vybrané účty.</td></tr>}</tbody></table></div></div>
  </div></Shell>;
}
