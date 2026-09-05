import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { MethodologyCallout } from "@/components/MethodologyCallout";
import { Flash } from "@/components/FormUi";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { dateInput } from "@/lib/forms";
import { defaultServiceSettlementPeriod, loadServiceSettlementPreview } from "@/lib/service-settlement-preview";
import { listServiceSettlementProtocols } from "@/lib/service-settlement-protocols";
import { contractingPartyNames } from "@/lib/lease-parties";
import { editableUnitWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { businessDateKey } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export default async function ServiceSettlementPreviewPage({ params, searchParams }: { params: Promise<{ leaseId: string }>; searchParams: Promise<{ from?: string; to?: string; ok?: string; error?: string }> }) {
  const user = await requireUser(), { leaseId } = await params, query = await searchParams, defaults = defaultServiceSettlementPeriod();
  let preview: Awaited<ReturnType<typeof loadServiceSettlementPreview>>;
  let periodError = "";
  try { preview = await loadServiceSettlementPreview(user, leaseId, query.from, query.to); } catch (error) {
    if (!query.from && !query.to) notFound();
    periodError = error instanceof Error ? error.message : "Zadané období není platné.";
    try { preview = await loadServiceSettlementPreview(user, leaseId, defaults.from, defaults.to); } catch { notFound(); }
  }
  const [protocols, canIssue] = await Promise.all([
    listServiceSettlementProtocols(user, leaseId),
    prisma.unit.findFirst({ where: { id: preview.lease.unitId, ...editableUnitWhere(user, preview.lease.unit.propertyId) }, select: { id: true } }).then(Boolean),
  ]);
  const existing = protocols.find((protocol) => businessDateKey(protocol.periodFrom) === preview.period.from && businessDateKey(protocol.periodTo) === preview.period.to);
  const suggestedDueDate = new Date(); suggestedDueDate.setUTCDate(suggestedDueDate.getUTCDate() + 14);
  const resultLabel = preview.balanceCents > 0 ? "Předběžný nedoplatek" : preview.balanceCents < 0 ? "Předběžný přeplatek" : "Předběžně vyrovnáno";
  return <Shell user={user}><div className="page service-settlement-page">
    <div className="breadcrumb"><Link href={`/smlouvy/${leaseId}`}>← Smlouva</Link><span>›</span><span>Vyúčtování služeb</span></div>
    <div className="page-title"><div><span className="eyebrow">Pracovní náhled · bez zaúčtování</span><h1>Vyúčtování služeb</h1><p>{contractingPartyNames(preview.lease).join(" + ")} · {preview.lease.unit.property.name} · {preview.lease.unit.label}</p></div><span className={`status ${preview.ready ? "ok" : "warn"}`}>{preview.ready ? "Podklady připravené" : "Doplnit podklady"}</span></div>
    <Flash ok={query.ok} error={query.error}/>
    {periodError&&<p className="form-error">{periodError} Zobrazuji poslední uzavřený kalendářní rok.</p>}
    <form className="card settlement-period-form" method="get"><label className="field"><span>Období od</span><input name="from" type="date" defaultValue={preview.period.from || defaults.from} required/></label><label className="field"><span>Období do</span><input name="to" type="date" defaultValue={preview.period.to || defaults.to} required/></label><button className="primary">Přepočítat náhled</button></form>
    <div className="notice asset-scope-note"><strong>Co tento náhled dělá</strong><span>Porovnává předepsané zálohy s evidovanými skutečnými náklady přiřazenými jednotce. Platby záloh se evidují na celém měsíčním předpisu a předběžný výsledek zde nemění smlouvu, předpis ani přeplatek.</span></div>
    <div className="settlement-summary-grid"><Summary label="Předepsané zálohy" value={money(preview.advancesCents)} note={`${preview.advanceRows.length} měsíčních položek`}/><Summary label="Skutečné náklady" value={money(preview.actualCostsCents)} note={`${preview.costRows.length} přiřazených podkladů`}/><Summary label={resultLabel} value={money(Math.abs(preview.balanceCents))} note="náklady − předepsané zálohy" tone={preview.balanceCents > 0 ? "warn" : preview.balanceCents < 0 ? "ok" : ""}/></div>
    {(preview.blockers.length>0||preview.warnings.length>0)&&<div className="settlement-readiness"><div className="card"><h2>Před vystavením doplnit</h2>{preview.blockers.length?preview.blockers.map((message)=><p className="legal-warning" key={message}>{message}</p>):<p className="notice"><strong>Žádný blokátor</strong><span>Zdroje jsou připravené k další kontrole.</span></p>}</div><div className="card"><h2>Upozornění ke kontrole</h2>{preview.warnings.length?preview.warnings.map((message)=><p className="notice" key={message}>{message}</p>):<p className="muted-copy">Bez dalších upozornění.</p>}</div></div>}
    <div className="card settlement-source-card"><div className="card-head"><div><h2>Skutečné náklady a způsob rozdělení</h2><p className="muted-copy">Pouze skutečné OPEX náklady kategorie Energie a služby v zadaném období.</p></div><Link className="secondary" href={`/nemovitosti/${preview.lease.unit.propertyId}/finance#naklady`}>Otevřít náklady objektu</Link></div><div className="table-wrap"><table><thead><tr><th>Datum</th><th>Zdroj</th><th>Celý doklad</th><th>Přiřazeno jednotce</th><th>Pravidlo</th><th>Doklady</th></tr></thead><tbody>{preview.costRows.length?preview.costRows.map((row)=><tr key={row.id}><td>{date(row.effectiveAt)}</td><td><strong>{row.title}</strong></td><td>{money(row.sourceAmountCents)}</td><td>{money(row.allocatedAmountCents)}</td><td>{row.allocationLabel}</td><td>{row.documentCount}</td></tr>):<tr><td className="table-empty" colSpan={6}>Žádné použitelné náklady.</td></tr>}</tbody></table></div></div>
    <div className="card settlement-source-card"><div className="card-head"><div><h2>Předepsané zálohy</h2><p className="muted-copy">Součet položek Služby, Voda, Topení a Elektřina; nájemné je vyloučeno.</p></div><Link className="secondary" href={`/nemovitosti/${preview.lease.unit.propertyId}/predpisy/${leaseId}`}>Otevřít předpisy</Link></div><div className="settlement-chip-list">{preview.advanceRows.length?preview.advanceRows.map((row)=><span key={row.id}><small>{row.period}</small><strong>{money(row.amountCents)}</strong></span>):<p className="muted-copy">Bez dohledatelných záloh.</p>}</div></div>
    <div className="card settlement-source-card"><div className="card-head"><div><h2>Odečty měřidel</h2><p className="muted-copy">Kontrolní podklad; náklad se zatím počítá z uloženého rozdělení účetního dokladu.</p></div><Link className="secondary" href={`/nemovitosti/${preview.lease.unit.propertyId}/jednotky/${preview.lease.unitId}`}>Otevřít jednotku</Link></div><div className="table-wrap"><table><thead><tr><th>Měřidlo</th><th>Počáteční stav</th><th>Koncový stav</th><th>Spotřeba</th></tr></thead><tbody>{preview.meterRows.length?preview.meterRows.map((row)=><tr key={row.id}><td><strong>{row.label}</strong></td><td>{row.opening?`${row.opening.value.toLocaleString("cs-CZ")} · ${date(row.opening.readAt)}`:"Chybí"}</td><td>{row.closing?`${row.closing.value.toLocaleString("cs-CZ")} · ${date(row.closing.readAt)}`:"Chybí"}</td><td>{row.consumption==null?"—":`${row.consumption.toLocaleString("cs-CZ")} ${row.unitOfMeasure}`}</td></tr>):<tr><td className="table-empty" colSpan={4}>Jednotka nemá aktivní měřidla.</td></tr>}</tbody></table></div></div>
    <div className="card settlement-next-step"><div><h2>Další krok: vystavení protokolu</h2><p className="muted-copy">Vystavení zmrazí právě zobrazené podklady a vytvoří přesně jeden nedoplatek nebo přeplatek. Vystavený protokol už nelze přepsat.</p></div>{existing?<Link className="primary" href={`/smlouvy/${leaseId}/vyuctovani/${existing.id}`}>Otevřít vystavený protokol</Link>:canIssue&&preview.ready?<form className="settlement-issue-form" method="post" action={`/api/properties/${preview.lease.unit.propertyId}/leases/${leaseId}/service-settlements`}><input type="hidden" name="from" value={preview.period.from}/><input type="hidden" name="to" value={preview.period.to}/>{preview.balanceCents>0&&<label className="field"><span>Splatnost nedoplatku</span><input type="date" name="dueDate" defaultValue={dateInput(suggestedDueDate)} required/></label>}<label className="checkbox-field"><input type="checkbox" name="confirm"/><span>Zkontroloval/a jsem zdroje, rozdělení, odečty a výsledek.</span></label><button className="primary">Vystavit a zaúčtovat</button></form>:<button className="primary" disabled>{canIssue?"Nejprve odstraňte blokátory":"Pouze ke čtení"}</button>}</div>
    {protocols.length>0&&<div className="card settlement-protocol-history"><div className="card-head"><div><h2>Vystavené protokoly</h2><p className="muted-copy">Neměnná historie smlouvy.</p></div></div><div className="revision-list">{protocols.map((protocol)=><Link href={`/smlouvy/${leaseId}/vyuctovani/${protocol.id}`} key={protocol.id}><span><strong>{date(protocol.periodFrom)} – {date(protocol.periodTo)}</strong><small>Vystavil/a {protocol.issuedBy.name} · {date(protocol.issuedAt)}</small></span><span className={`status ${protocol.balanceCents<=0?"ok":"warn"}`}>{protocol.balanceCents>0?`Nedoplatek ${money(protocol.balanceCents)}`:protocol.balanceCents<0?`Přeplatek ${money(Math.abs(protocol.balanceCents))}`:"Vyrovnáno"}</span></Link>)}</div></div>}
    <MethodologyCallout slug="vyuctovani-sluzeb" compact/>
  </div></Shell>;
}

function Summary({label,value,note,tone=""}:{label:string;value:string;note:string;tone?:string}){return <div className={`card settlement-summary ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>}
