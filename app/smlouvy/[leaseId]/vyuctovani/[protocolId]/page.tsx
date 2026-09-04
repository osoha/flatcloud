import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { PrintButton } from "@/components/PrintButton";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { loadServiceSettlementProtocol, parseServiceSettlementSnapshot } from "@/lib/service-settlement-protocols";

export const dynamic = "force-dynamic";

export default async function ServiceSettlementProtocolPage({ params, searchParams }: { params: Promise<{ leaseId: string; protocolId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser(), { leaseId, protocolId } = await params, query = await searchParams;
  let protocol: Awaited<ReturnType<typeof loadServiceSettlementProtocol>>;
  try { protocol = await loadServiceSettlementProtocol(user, leaseId, protocolId); } catch { notFound(); }
  const snapshot = parseServiceSettlementSnapshot(protocol.snapshot), resultLabel = protocol.balanceCents > 0 ? "Nedoplatek" : protocol.balanceCents < 0 ? "Přeplatek" : "Vyrovnáno";
  return <Shell user={user}><div className="page service-protocol-page">
    <div className="breadcrumb"><Link href={`/smlouvy/${leaseId}/vyuctovani?from=${snapshot.period.from}&to=${snapshot.period.to}`}>← Vyúčtování</Link><span>›</span><span>Vystavený protokol</span></div>
    <div className="page-title"><div><span className="eyebrow">Neměnný protokol · vystaveno {date(protocol.issuedAt)}</span><h1>Vyúčtování služeb</h1><p>{snapshot.lease.tenantNames.join(" + ")} · {snapshot.property.name} · {snapshot.unit.label}</p></div><div className="action-row"><span className="status ok">Vystaveno</span><PrintButton label="Vytisknout / uložit PDF"/></div></div>
    <Flash ok={query.ok} error={query.error}/>
    <section className="card protocol-identity"><div><small>Zúčtovací období</small><strong>{snapshot.period.from} – {snapshot.period.to}</strong></div><div><small>Smlouva</small><strong>{snapshot.lease.contractNumber || "Bez čísla"}</strong></div><div><small>Nemovitost</small><strong>{snapshot.property.name}</strong><span>{snapshot.property.address}, {snapshot.property.city}</span></div><div><small>Nájemce</small><strong>{snapshot.lease.tenantNames.join(" + ")}</strong></div></section>
    <div className="settlement-summary-grid"><Summary label="Předepsané zálohy" value={money(protocol.advancesCents)}/><Summary label="Skutečné náklady" value={money(protocol.actualCostsCents)}/><Summary label={resultLabel} value={money(Math.abs(protocol.balanceCents))} tone={protocol.balanceCents>0?"warn":"ok"}/></div>
    <section className="card protocol-result"><div><h2>Výsledek vyúčtování</h2><p>{protocol.balanceCents>0?`Nájemci vznikl nedoplatek ${money(protocol.balanceCents)} se splatností ${protocol.dueDate?date(protocol.dueDate):"—"}.`:protocol.balanceCents<0?`Nájemci vznikl přeplatek ${money(Math.abs(protocol.balanceCents))}, který je evidován u smlouvy.`:"Náklady a předepsané zálohy jsou vyrovnané."}</p></div>{protocol.charge&&<Link className="primary" href={`/nemovitosti/${snapshot.property.id}/predpisy/mesicni/${protocol.charge.id}`}>Otevřít nedoplatek</Link>}{protocol.credit&&<Link className="primary" href={`/smlouvy/${leaseId}#vyuctovani`}>Otevřít přeplatek</Link>}</section>
    <section className="card settlement-source-card"><h2>Rozpis skutečných nákladů</h2><div className="table-wrap"><table><thead><tr><th>Datum</th><th>Zdroj</th><th>Částka dokladu</th><th>Podíl jednotky</th><th>Způsob rozdělení</th></tr></thead><tbody>{snapshot.costs.map((row)=><tr key={row.sourceCostId}><td>{row.effectiveAt}</td><td><strong>{row.title}</strong></td><td>{money(row.sourceAmountCents)}</td><td>{money(row.allocatedAmountCents)}</td><td>{row.allocationLabel}</td></tr>)}</tbody></table></div></section>
    <section className="card settlement-source-card"><h2>Rozpis předepsaných záloh</h2><div className="settlement-chip-list">{snapshot.advances.map((row)=><span key={row.period}><small>{row.period}</small><strong>{money(row.amountCents)}</strong></span>)}</div></section>
    <section className="card settlement-source-card"><h2>Odečty</h2><div className="table-wrap"><table><thead><tr><th>Měřidlo</th><th>Počáteční stav</th><th>Koncový stav</th><th>Spotřeba</th></tr></thead><tbody>{snapshot.meters.length?snapshot.meters.map((row)=><tr key={`${row.label}-${row.unitOfMeasure}`}><td><strong>{row.label}</strong></td><td>{row.opening?`${row.opening.value.toLocaleString("cs-CZ")} · ${row.opening.date}`:"—"}</td><td>{row.closing?`${row.closing.value.toLocaleString("cs-CZ")} · ${row.closing.date}`:"—"}</td><td>{row.consumption==null?"—":`${row.consumption.toLocaleString("cs-CZ")} ${row.unitOfMeasure}`}</td></tr>):<tr><td className="table-empty" colSpan={4}>Bez evidovaných měřidel.</td></tr>}</tbody></table></div></section>
    {snapshot.warnings.length>0&&<section className="card protocol-notes"><h2>Poznámky k podkladům</h2>{snapshot.warnings.map((warning)=><p key={warning}>{warning}</p>)}</section>}
    <footer className="protocol-footer"><span>Vystavil/a {protocol.issuedBy.name}</span><span>{date(protocol.issuedAt)}</span><span>ID protokolu {protocol.id}</span></footer>
  </div></Shell>;
}

function Summary({label,value,tone=""}:{label:string;value:string;tone?:string}){return <div className={`card settlement-summary ${tone}`}><span>{label}</span><strong>{value}</strong><small>zmrazeno při vystavení</small></div>}
