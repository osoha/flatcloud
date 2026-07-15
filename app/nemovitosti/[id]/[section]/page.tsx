import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { requireUser, canManageProperty } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { money,date } from "@/lib/format";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";
import { currentPeriod } from "@/lib/period";
import { leaseStatuses, unitStatuses, unitTypes } from "@/lib/labels";

export const dynamic="force-dynamic";

type TenantLeaseSummary = { unit: { label: string } };
type TenantSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
};
type TenantOverview = { tenant: TenantSummary; leases: TenantLeaseSummary[] };

export default async function PropertyPage({params,searchParams}:{params:Promise<{id:string;section:string}>;searchParams:Promise<{ok?:string;error?:string}>}){
  const {id,section}=await params; const query=await searchParams; const user=await requireUser(); const p=await requirePropertyAccess(user,id); if(!p)notFound();
  const canManage=canManageProperty(user.role); const bank=p.bankAccounts.find(account=>account.provider!=="manual"); const period=currentPeriod();
  const leases=p.units.flatMap(unit=>unit.leases.map(lease=>({...lease,unit}))); const currentCharges=leases.flatMap(lease=>lease.charges.filter(charge=>charge.period===period).map(charge=>({lease,charge,paid:charge.allocations.reduce((s,a)=>s+a.amountCents,0)})));
  const allCharges=leases.flatMap(lease=>lease.charges.map(charge=>({lease,charge,paid:charge.allocations.reduce((s,a)=>s+a.amountCents,0)}))).sort((a,b)=>b.charge.dueDate.getTime()-a.charge.dueDate.getTime());
  const expected=currentCharges.reduce((s,row)=>s+row.charge.amountCents,0),paid=currentCharges.reduce((s,row)=>s+row.paid,0);
  const txs=await prisma.bankTransaction.findMany({where:{bankAccount:{propertyId:id}},orderBy:{bookedAt:"desc"},include:{bankAccount:true}});
  const debts=allCharges.filter(row=>row.paid<row.charge.amountCents);
  const uniqueTenants = Array.from(
    new Map<string, TenantOverview>(
      leases.map((lease) => [
        lease.tenant.id,
        {
          tenant: lease.tenant,
          leases: leases.filter((row) => row.tenant.id === lease.tenant.id),
        },
      ]),
    ).values(),
  );

  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>{p.name}</span></div><div className="property-header"><div className="property-big-icon">⌂</div><div><h1>{p.name}</h1><p>{p.address}, {p.postalCode?`${p.postalCode} `:""}{p.city}</p><div className="property-meta"><span className="meta-pill">{p.owner.name}</span><span className="meta-pill">{p.units.length} jednotek</span><span className="meta-pill">{bank?.bankName||"Banka nepřipojena"}</span></div></div><div className="property-header-right"><span>Saldo {period}</span><strong className={paid-expected<0?"negative":"positive"}>{money(paid-expected)}</strong></div></div><PropertySubnav propertyId={id} active={section}/><Flash ok={query.ok} error={query.error}/>
  {section==="prehled"&&<><div className="stat-grid"><Stat label="Předpis" value={money(expected)} note={period}/><Stat label="Uhrazeno" value={money(paid)} note={`${expected?Math.round(paid/expected*100):100} % inkaso`} good/><Stat label="Dluh" value={money(Math.max(0,expected-paid))} note={`${debts.length} otevřených předpisů`} bad/><Stat label="Jednotky" value={String(p.units.length)} note={`${p.units.filter(unit=>unit.status==="OCCUPIED").length} obsazených`}/><Stat label="Nespárované" value={String(txs.filter(t=>t.status==="UNMATCHED").length)} note="bankovní transakce"/></div><div className="detail-grid"><div className="card col-8"><div className="card-head"><h2>Poslední platby</h2><Link href={`/nemovitosti/${id}/platby`}>Zobrazit vše</Link></div><TablePayments txs={txs.slice(0,6)}/></div><div className="card col-4"><div className="card-head"><h2>Stav evidence</h2></div><div className="summary-list"><div><span>Aktivní smlouvy</span><strong>{leases.filter(l=>l.status==="ACTIVE").length}</strong></div><div><span>Pravidelné položky</span><strong>{leases.reduce((s,l)=>s+l.paymentItems.filter(i=>i.active).length,0)}</strong></div><div><span>Předpisy za období</span><strong>{currentCharges.length}</strong></div><div><span>Otevřené dluhy</span><strong>{debts.length}</strong></div></div></div></div></>}
  {section==="jednotky"&&<SectionCard title="Jednotky" action={canManage?<Link className="primary" href={`/nemovitosti/${id}/jednotky/nova`}><Plus size={15}/> Přidat jednotku</Link>:null}><GenericTable headers={["Jednotka","Typ","Podlaží","Plocha","Nájemník","Stav",""]} rows={p.units.map(unit=>{const active=unit.leases.find(lease=>lease.status==="ACTIVE");return [<strong key="l">{unit.label}</strong>,unitTypes[unit.type],unit.floor||"—",unit.areaM2?`${unit.areaM2} m²`:"—",active?.tenant.name||"Volná",<span className={`status ${unit.status==="OCCUPIED"?"ok":unit.status==="RENOVATION"?"warn":""}`} key="s">{unitStatuses[unit.status]}</span>,canManage?<Link className="table-link" key="e" href={`/nemovitosti/${id}/jednotky/${unit.id}/upravit`}>Upravit</Link>:""]})}/></SectionCard>}
  {section==="najemnici"&&<SectionCard title="Nájemníci" action={canManage?<Link className="primary" href={`/nemovitosti/${id}/najemnici/novy`}><Plus size={15}/> Přidat nájemníka</Link>:null}><GenericTable headers={["Nájemník","Jednotky","E-mail","Telefon","Stav",""]} rows={uniqueTenants.map(({tenant,leases:tenantLeases})=>[<strong key="n">{tenant.name}</strong>,tenantLeases.map(l=>l.unit.label).join(", "),tenant.email||"—",tenant.phone||"—",<span className={`status ${tenant.active?"ok":"bad"}`} key="s">{tenant.active?"Aktivní":"Neaktivní"}</span>,canManage?<Link className="table-link" key="e" href={`/nemovitosti/${id}/najemnici/${tenant.id}/upravit`}>Upravit</Link>:""])}/></SectionCard>}
  {section==="smlouvy"&&<SectionCard title="Nájemní smlouvy" action={canManage?<Link className="primary" href={`/nemovitosti/${id}/smlouvy/nova`}><Plus size={15}/> Přidat smlouvu</Link>:null}><GenericTable headers={["Jednotka","Nájemník","Číslo smlouvy","Od","Do","Měsíčně","Stav",""]} rows={leases.map(lease=>[lease.unit.label,lease.tenant.name,lease.contractNumber||"—",date(lease.startDate),lease.endDate?date(lease.endDate):"neurčito",money(lease.paymentItems.filter(i=>i.active).reduce((s,i)=>s+i.amountCents,0)),leaseStatuses[lease.status],canManage?<Link className="table-link" key="e" href={`/nemovitosti/${id}/smlouvy/${lease.id}/upravit`}>Upravit</Link>:""])}/></SectionCard>}
  {section==="predpisy"&&<><div className="card generation-card"><div><h2>Měsíční předpisy</h2><p>Vygenerují se z položek platných pro zvolené období. Existující předpis se nepřepíše.</p></div>{canManage&&<form action={`/api/properties/${id}/charges/generate`} method="post" className="generation-form"><input type="month" name="period" defaultValue={period} required/><button className="primary" type="submit">Vytvořit předpisy</button></form>}</div><SectionCard title="Předpisy a šablony" action={null}><GenericTable headers={["Jednotka","Nájemník","Měsíční šablona","Poslední předpis","Saldo",""]} rows={leases.map(lease=>{const latest=lease.charges[0];const latestPaid=latest?.allocations.reduce((s,a)=>s+a.amountCents,0)||0;return [lease.unit.label,lease.tenant.name,money(lease.paymentItems.filter(i=>i.active).reduce((s,i)=>s+i.amountCents,0)),latest?.period||"—",latest?money(latestPaid-latest.amountCents):"—",<Link className="table-link" key="e" href={`/nemovitosti/${id}/predpisy/${lease.id}`}>Otevřít předpisy</Link>]})}/></SectionCard></>}
  {section==="platby"&&<SectionCard title="Platby" action={canManage?<Link className="primary" href={`/nemovitosti/${id}/platby/nova`}><Plus size={15}/> Ruční platba</Link>:null}><TablePayments txs={txs}/></SectionCard>}
  {section==="dluznici"&&<SectionCard title="Otevřené pohledávky" action={null}><GenericTable headers={["Nájemník","Jednotka","Období","Splatnost","Předpis","Uhrazeno","Dluh"]} rows={debts.map(row=>[row.lease.tenant.name,row.lease.unit.label,<Link className="table-link" key="p" href={`/nemovitosti/${id}/predpisy/mesicni/${row.charge.id}`}>{row.charge.period}</Link>,date(row.charge.dueDate),money(row.charge.amountCents),money(row.paid),<strong className="negative" key="d">{money(row.charge.amountCents-row.paid)}</strong>])}/></SectionCard>}
  {section==="banka"&&<div className="card"><div className="card-head"><h2>Bankovní účet objektu</h2></div>{bank?<div className="bank-detail"><div className="bank-logo">BANK</div><div><h3>{bank.bankName}</h3><p>{bank.ibanMasked} · {bank.provider}</p><p>Stav: {bank.connectionStatus} · poslední synchronizace {bank.lastSyncedAt?date(bank.lastSyncedAt):"nikdy"}</p></div></div>:<div className="empty-state"><h2>Účet zatím není připojen</h2><p>Bankovní sandbox bude následovat po dokončení evidence a předpisů.</p></div>}<div className="notice" style={{marginTop:18}}>Ruční platby se ukládají do samostatného technického účtu a lze na nich otestovat salda bez bankovního napojení.</div></div>}
  {section==="nastaveni"&&<div className="detail-grid"><div className="card col-8"><div className="card-head"><h2>Nastavení nemovitosti</h2>{canManage&&<Link className="primary" href={`/nemovitosti/${id}/upravit`}><Settings2 size={15}/> Upravit</Link>}</div><div className="summary-list"><div><span>Název</span><strong>{p.name}</strong></div><div><span>Vlastník / SPV</span><strong>{p.owner.name}</strong></div><div><span>Adresa</span><strong>{p.address}, {p.city}</strong></div><div><span>Stav</span><strong>{p.active?"Aktivní":"Neaktivní"}</strong></div></div>{p.note&&<div className="notice" style={{marginTop:16}}>{p.note}</div>}</div><div className="card col-4"><h2>Bezpečnost dat</h2><p className="muted-copy">Veškeré jednotky, smlouvy, předpisy i platby jsou vždy vázány na tento objekt. Přístup běžných uživatelů se kontroluje podle přiřazení nemovitosti.</p></div></div>}
  </div></Shell>;
}

function Stat({label,value,note,good,bad}:{label:string;value:string;note:string;good?:boolean;bad?:boolean}){return <div className="card stat"><div><span>{label}</span><strong className={bad?"negative":good?"positive":""}>{value}</strong><small className={good?"good":bad?"bad":""}>{note}</small></div></div>}
function SectionCard({title,action,children}:{title:string;action:React.ReactNode;children:React.ReactNode}){return <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>{title}</h2></div>{action}</div>{children}</div>}
function GenericTable({headers,rows}:{headers:string[];rows:React.ReactNode[][]}){return <div className="table-wrap"><table><thead><tr>{headers.map((h,i)=><th key={`${h}-${i}`}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>):<tr><td colSpan={headers.length} className="table-empty">Bez záznamů</td></tr>}</tbody></table></div>}
function TablePayments({txs}:{txs:any[]}){return <div className="table-wrap"><table><thead><tr><th>Datum</th><th>Plátce</th><th>VS</th><th>Zdroj</th><th>Částka</th><th>Stav</th></tr></thead><tbody>{txs.length?txs.map(transaction=><tr key={transaction.id}><td>{date(transaction.bookedAt)}</td><td>{transaction.counterpartyName||"Neznámý plátce"}</td><td>{transaction.variableSymbol||"—"}</td><td>{transaction.bankAccount?.provider==="manual"?"Ruční evidence":transaction.bankAccount?.bankName||"Banka"}</td><td className="money">{money(transaction.amountCents)}</td><td><span className={`status ${transaction.status==="MATCHED"?"ok":transaction.status==="UNMATCHED"?"bad":"warn"}`}>{transaction.status}</span></td></tr>):<tr><td colSpan={6} className="table-empty">Bez transakcí</td></tr>}</tbody></table></div>}
