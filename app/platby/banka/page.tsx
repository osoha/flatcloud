import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bankAccountScopes } from "@/lib/account-banking-access";
import { bankAccountMatches } from "@/lib/inbound-bank/bank-email";
import { ownerBankAccountLabel } from "@/lib/owner-bank-account";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { PageHeading } from "@/components/PageHeading";
import { date,money } from "@/lib/format";

export const dynamic="force-dynamic";
export default async function AccountBanking({searchParams}:{searchParams:Promise<{account?:string;stav?:string;ok?:string;error?:string}>}) {
  const user=await requireUser();const query=await searchParams;
  const accounts=await bankAccountScopes(user);
  const selected=query.account?accounts.filter(a=>a.id===query.account):accounts;
  const status=query.stav||"ke-reseni";
  // Scope before pagination: historical ignored mail remains discoverable to its account owner.
  const rows=(await prisma.inboxPayment.findMany({where:{...(status==="ignorovane"?{status:"IGNORED" as const}:status==="vse"?{}:{status:{in:["RECEIVED","UNMATCHED","ERROR"] as const}})},include:{property:{select:{name:true}},transaction:{include:{bankAccount:{select:{propertyId:true}}}}},orderBy:{receivedAt:"desc"}})).filter(r=>selected.some(a=>bankAccountMatches(a,r.recipientAccount))).slice(0,200);
  return <Shell user={user}><div className="page"><Flash {...query}/><div className="page-title"><div><PageHeading>Bankovní pohyby</PageHeading><p>Příjmy a výdaje vašich účtů napříč domy. Pohyb bez přiřazeného domu zůstává dostupný u účtu.</p></div><Link className="secondary" href="/platby/banka/pravidla">Pravidla účtů</Link></div>
    <form className="card account-bank-filter" method="get"><label className="field"><span>Bankovní účet</span><select name="account" defaultValue={query.account||""}><option value="">Všechny dostupné účty</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.owner.name} · {ownerBankAccountLabel(a)}{a.active?"":" · neaktivní"}</option>)}</select></label><label className="field"><span>Zobrazení</span><select name="stav" defaultValue={status}><option value="ke-reseni">K řešení</option><option value="ignorovane">Ignorované</option><option value="vse">Všechny pohyby</option></select></label><button className="secondary">Zobrazit</button></form>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>{status==="ignorovane"?"Ignorované bankovní pohyby":status==="vse"?"Historie bankovních pohybů":"Bankovní pohyby k řešení"}</h2><p>Posledních {rows.length} dostupných pohybů pro zvolený výběr.</p></div></div><div className="table-wrap"><table><thead><tr><th>Datum</th><th>Účet</th><th>Nemovitost</th><th>Protistrana / VS</th><th>Částka</th><th>Stav</th><th></th></tr></thead><tbody>{rows.length?rows.map(row=>{const account=selected.find(a=>bankAccountMatches(a,row.recipientAccount))!;return <tr key={row.id}><td>{date(row.bookedAt||row.receivedAt)}</td><td>{account.owner.name}<small className="owner-sub">{ownerBankAccountLabel(account)}</small></td><td>{row.property?.name||"Dům zatím nepřiřazen"}</td><td>{row.counterpartyName||row.counterpartyAccount||"Protistrana neuvedena"}<small className="owner-sub">{row.variableSymbol?`VS ${row.variableSymbol}`:"Bez VS"}</small></td><td className="money">{row.amountCents!=null?`${money(row.amountCents).replace("Kč",row.currency)}`:"—"}</td><td>{row.status==="IGNORED"?"Ignorováno":row.status==="IMPORTED"?"Předáno do evidence":"K řešení"}<small className="owner-sub">{row.parseNote}</small></td><td><Link href={`/platby/nesparovane/email/${row.id}`} className="table-link">Detail / pravidlo</Link></td></tr>}):<tr><td colSpan={7} className="table-empty">Pro tento výběr nejsou žádné bankovní pohyby.</td></tr>}</tbody></table></div></div>
  </div></Shell>;
}
