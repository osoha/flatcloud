import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { editableUnitWhere, leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { date, money } from "@/lib/format";
import { dateInput, moneyInput } from "@/lib/forms";
import { effectiveLeaseEnd, leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseStatuses } from "@/lib/labels";
import { securityDepositSnapshot } from "@/lib/security-deposit";
import { outstandingCents } from "@/lib/charges";
import { remainingCreditCents } from "@/lib/credit";
import { documentAccessWhere } from "@/lib/documents/access";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";

export const dynamic = "force-dynamic";
const depositStatuses = { NOT_CONFIGURED: "Neevidováno", UNPAID: "Nesloženo", PARTIAL: "Částečně složeno", FUNDED: "Složeno", TO_SETTLE: "K vypořádání", SETTLED: "Vypořádáno" };
const movementLabels = { RECEIVED: "Přijato", RETURNED: "Vráceno", OFFSET: "Započteno", ADJUSTMENT_INCREASE: "Korekce jistiny +", ADJUSTMENT_DECREASE: "Korekce jistiny −", INTEREST_PAID: "Úrok vyplacen", INTEREST_ADJUSTMENT_INCREASE: "Korekce úroku +", INTEREST_ADJUSTMENT_DECREASE: "Korekce úroku −" };

export default async function LeaseDetail({ params, searchParams }: { params: Promise<{ leaseId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { leaseId } = await params;
  const [lease, query] = await Promise.all([prisma.lease.findFirst({ where: { id: leaseId, ...leaseAccessWhere(user) }, include: {
    tenant: true, ownerBankAccount: true, unit: { include: { property: true } },
    securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] },
    securityDepositMovements: { include: { offsetCharge: true }, orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] },
    charges: { where: { active: true }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true }, orderBy: { dueDate: "asc" } },
    credits: { include: { applications: { include: { charge: true } } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }] },
  } }), searchParams]);
  if (!lease) notFound();
  const snapshot = securityDepositSnapshot(lease);
  const effectiveEnd = effectiveLeaseEnd(lease);
  const canEdit = Boolean(await prisma.unit.findFirst({ where: { id: lease.unitId, ...editableUnitWhere(user, lease.unit.propertyId) }, select: { id: true } }));
  const today = dateInput(new Date());
  const openCharges = lease.charges.filter((charge) => outstandingCents(charge) > 0);
  const action = `/api/properties/${lease.unit.propertyId}/leases/${lease.id}`;
  const documents=await prisma.document.findMany({where:{AND:[documentAccessWhere(user),{leaseId:lease.id}]},orderBy:{createdAt:"desc"},include:{fileAsset:true,property:{select:{name:true}},unit:{select:{label:true}},lease:{select:{contractNumber:true}},task:{select:{title:true}},complianceRecord:{select:{id:true}}}});
  return <Shell user={user} taskPropertyId={lease.unit.propertyId} taskLeaseId={lease.id}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={`/nemovitosti/${lease.unit.propertyId}/prehled`}>{lease.unit.property.name}</Link><span>›</span><Link href={`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unitId}`}>{lease.unit.label}</Link><span>›</span><span>{lease.contractNumber || "Smlouva"}</span></div>
    <div className="page-title"><div><h1>{lease.contractNumber || "Smlouva"}</h1><p>{lease.tenant.name} · {lease.unit.property.name} · {lease.unit.label}</p></div>{canEdit&&<Link className="primary" href={`/nemovitosti/${lease.unit.propertyId}/smlouvy/${lease.id}/upravit`}>Upravit smlouvu</Link>}</div>
    <Flash ok={query.ok} error={query.error}/><div className="detail-grid">
      <div className="card col-6"><h2>Vztah a smlouva</h2><div className="summary-list"><div><span>Nájemník</span><strong><Link href={`/najemnici/${lease.tenantId}`}>{lease.tenant.name}</Link></strong></div><div><span>Nemovitost</span><strong><Link href={`/nemovitosti/${lease.unit.propertyId}/prehled`}>{lease.unit.property.name}</Link></strong></div><div><span>Jednotka</span><strong>{lease.unit.label}</strong></div><div><span>Stav</span><strong>{leaseStatuses[leaseStatusAt(lease)]}</strong></div><div><span>Období</span><strong>{date(lease.startDate)} – {effectiveEnd ? date(effectiveEnd) : "neurčito"}</strong></div></div></div>
      <div className="card col-6 deposit-card" id="kauce"><div className="card-head"><h2>Kauce</h2><span className="deposit-status">{depositStatuses[snapshot.status]}</span></div>
        <div className="deposit-kpis"><Kpi label="Sjednáno" value={money(snapshot.agreedAmountCents)}/><Kpi label="Drženo" value={money(snapshot.heldPrincipalCents)}/><Kpi label="Chybí doplatit / přebytek" value={snapshot.excessDepositCents?`+ ${money(snapshot.excessDepositCents)}`:money(snapshot.missingDepositCents)}/><Kpi label="Úrok p.a." value={`${(snapshot.currentAnnualRateBps/100).toLocaleString("cs-CZ")} %`}/><Kpi label="Naběhlý úrok" value={money(snapshot.accruedInterestCents)}/><Kpi label="Vyplacený úrok" value={money(snapshot.interestPaidCents)}/><Kpi label="Započteno" value={money(snapshot.offsetCents)}/><Kpi label="Vráceno" value={money(snapshot.returnedCents)}/><Kpi label="K vrácení dnes" value={money(snapshot.amountToReturnCents)}/><Kpi label="Stav" value={depositStatuses[snapshot.status]}/></div>
        {snapshot.agreedAmountCents>0&&snapshot.receivedCents===0&&<p className="notice">Sjednaná kauce je evidována, ale skutečné složení není potvrzeno pohybem Přijato.</p>}
        {lease.unit.type==="APARTMENT"&&snapshot.currentAnnualRateBps===0&&<p className="legal-warning">Právní upozornění: u nájmu bytu ověřte zákonný nárok nájemce na úroky z jistoty. Nulová sazba zůstává povolena.</p>}
        {snapshot.agreedAmountCents>lease.rentCents*3&&<p className="legal-warning">Sjednaná jistota přesahuje trojnásobek měsíčního nájemného. Zkontrolujte zákonný limit; uložení není blokováno.</p>}
        {canEdit&&<div className="deposit-actions">
          <details><summary>Přijmout kauci</summary><MovementForm action={`${action}/deposit/movements`} type="RECEIVED" today={today}/></details>
          <details><summary>Vrátit kauci</summary><MovementForm action={`${action}/deposit/movements`} type="RETURNED" today={today}/></details>
          <details><summary>Započíst proti předpisu</summary><MovementForm action={`${action}/deposit/movements`} type="OFFSET" today={today} charges={openCharges}/></details>
          <details><summary>Jiný zápočet / škoda</summary><MovementForm action={`${action}/deposit/movements`} type="OFFSET" today={today} withoutCharge/></details>
          <details><summary>Upravit podmínky</summary><form className="compact-form" action={`${action}/deposit/terms`} method="post"><Input label="Sjednaná jistota Kč" name="agreedAmount" type="number" defaultValue={moneyInput(snapshot.agreedAmountCents)}/><Input label="Úrok p.a. %" name="annualRate" type="number" defaultValue={(snapshot.currentAnnualRateBps/100).toFixed(2)}/><Input label="Účinnost od" name="effectiveFrom" type="date" defaultValue={today}/><Input label="Poznámka" name="note"/><button className="primary">Uložit podmínky</button></form></details>
          <details><summary>Korekce jistiny / úroku</summary><form className="compact-form" action={`${action}/deposit/movements`} method="post"><label className="field"><span>Typ korekce</span><select name="type"><option value="ADJUSTMENT_INCREASE">Jistina +</option><option value="ADJUSTMENT_DECREASE">Jistina −</option><option value="INTEREST_ADJUSTMENT_INCREASE">Úrok +</option><option value="INTEREST_ADJUSTMENT_DECREASE">Úrok −</option><option value="INTEREST_PAID">Vyplacený úrok</option></select></label><Input label="Částka Kč" name="amount" type="number"/><Input label="Datum" name="effectiveAt" type="date" defaultValue={today}/><Input label="Důvod korekce" name="note"/><button className="primary">Uložit korekci</button></form></details>
        </div>}
        <h3>Historie pohybů</h3><div className="deposit-history">{lease.securityDepositMovements.length?lease.securityDepositMovements.map((movement)=><div key={movement.id}><span>{date(movement.effectiveAt)}</span><strong>{movementLabels[movement.type]}</strong><span>{money(movement.amountCents)}</span><span>{movement.offsetCharge?`Předpis ${movement.offsetCharge.period}`:movement.note||"—"}</span></div>):<p className="muted-copy">Zatím bez pohybů.</p>}</div>
        <h3>Historie podmínek</h3><div className="deposit-history">{lease.securityDepositTerms.length?lease.securityDepositTerms.map((term)=><div key={term.id}><span>{date(term.effectiveFrom)}</span><strong>{money(term.agreedAmountCents)}</strong><span>{(term.annualRateBps/100).toLocaleString("cs-CZ")} % p.a.</span><span>{term.note||"—"}</span></div>):<p className="muted-copy">Zatím bez podmínek.</p>}</div>
      </div>
    </div>
    <div className="card settlement-card" id="dokumenty"><div className="card-head"><h2>Dokumenty smlouvy</h2></div><DocumentAttachments documents={documents} canDelete={canEdit} returnTo={`/smlouvy/${lease.id}`}/>{canEdit&&<details className="create-panel"><summary>Nahrát dokument smlouvy</summary><DocumentUploadForm propertyId={lease.unit.propertyId} leaseId={lease.id} returnTo={`/smlouvy/${lease.id}`} categories={[["CONTRACT","Nájemní smlouva"],["CONTRACT_ADDENDUM","Dodatek"],["HANDOVER_PROTOCOL","Předávací protokol"],["PHOTO","Fotografie"],["OTHER","Ostatní"]]}/></details>}</div>
    <div className="card settlement-card" id="vyuctovani"><div className="card-head"><div><h2>Vyúčtování / kredity</h2><p className="muted-copy">Nedoplatek vytvoří předpis ADJUSTMENT, přeplatek kredit smlouvy.</p></div></div>
      {canEdit&&<details className="create-panel"><summary>Přidat výsledek vyúčtování</summary><form className="compact-form" action={`${action}/settlement`} method="post"><label className="field"><span>Výsledek</span><select name="kind"><option value="DEBIT">Nedoplatek</option><option value="CREDIT">Přeplatek</option></select></label><Input label="Částka Kč" name="amount" type="number"/><Input label="Datum / období" name="effectiveAt" type="date" defaultValue={today}/><Input label="Splatnost nedoplatku" name="dueDate" type="date" defaultValue={today}/><Input label="Popis období" name="description"/><Input label="Poznámka" name="note"/><button className="primary">Uložit výsledek</button></form></details>}
      <div className="table-wrap"><table><thead><tr><th>Původní kredit</th><th>Použito</th><th>Zbývá</th><th>Období</th><th>Datum</th><th>Historie použití</th></tr></thead><tbody>{lease.credits.length?lease.credits.map((credit)=>{const remaining=remainingCreditCents(credit);return <tr key={credit.id}><td><strong>{money(credit.amountCents)}</strong></td><td>{money(credit.amountCents-remaining)}</td><td>{money(remaining)}</td><td>{credit.description}</td><td>{date(credit.effectiveAt)}</td><td>{credit.applications.length?credit.applications.map((item)=><span className="entity-secondary" key={item.id}>{date(item.createdAt)} · {item.charge.period} · {money(item.amountCents)}</span>):"—"}</td></tr>}):<tr><td colSpan={6} className="table-empty">Zatím nejsou evidované přeplatky.</td></tr>}</tbody></table></div>
      {canEdit&&lease.credits.some((credit)=>remainingCreditCents(credit)>0)&&openCharges.length>0&&<details className="create-panel"><summary>Započíst přeplatek</summary><form className="compact-form" action={`${action}/settlement/apply`} method="post"><label className="field"><span>Kredit</span><select name="creditId">{lease.credits.filter((credit)=>remainingCreditCents(credit)>0).map((credit)=><option key={credit.id} value={credit.id}>{credit.description} · zbývá {money(remainingCreditCents(credit))}</option>)}</select></label><label className="field"><span>Otevřený předpis</span><select name="chargeId">{openCharges.map((charge)=><option key={charge.id} value={charge.id}>{charge.period} · zbývá {money(outstandingCents(charge))}</option>)}</select></label><Input label="Částka Kč" name="amount" type="number"/><button className="primary">Započíst přeplatek</button></form></details>}
    </div>
  </div></Shell>;
}

function Kpi({label,value}:{label:string;value:string}){return <div><span>{label}</span><strong>{value}</strong></div>}
function Input({label,name,type="text",defaultValue}:{label:string;name:string;type?:string;defaultValue?:string}){return <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} step={type==="number"?"0.01":undefined} min={type==="number"?"0":undefined} required={!['note'].includes(name)}/></label>}
function MovementForm({action,type,today,charges,withoutCharge=false}:{action:string;type:"RECEIVED"|"RETURNED"|"OFFSET";today:string;withoutCharge?:boolean;charges?:Array<{id:string;period:string;amountCents:number;allocations:Array<{amountCents:number}>;securityDepositOffsets:Array<{amountCents:number}>;creditApplications:Array<{amountCents:number}>}>}){return <form className="compact-form" action={action} method="post"><input type="hidden" name="type" value={type}/>{type==="OFFSET"&&!withoutCharge&&<label className="field"><span>Otevřený předpis</span><select name="chargeId" required>{charges?.map((charge)=><option key={charge.id} value={charge.id}>{charge.period} · zbývá {money(outstandingCents(charge))}</option>)}</select></label>}<Input label="Částka Kč" name="amount" type="number"/><Input label="Datum" name="effectiveAt" type="date" defaultValue={today}/>{type==="OFFSET"?<label className="field"><span>Důvod zápočtu</span><input name="note" required/></label>:<Input label="Poznámka" name="note"/>}<button className="primary">{type==="RECEIVED"?"Přijmout kauci":type==="RETURNED"?"Vrátit kauci":"Započíst"}</button></form>}
