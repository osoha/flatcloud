import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { date } from "@/lib/format";
import { loadPaymentCover } from "@/lib/lease-payment-cover/service";
import { paymentCoverMoney } from "@/lib/lease-payment-cover/core";

export const dynamic = "force-dynamic";
export default async function PaymentCoverPage({ params, searchParams }: { params: Promise<{ leaseId: string }>; searchParams: Promise<{ version?: string }> }) {
  const actor = await requireUser(), [{ leaseId }, query] = await Promise.all([params, searchParams]);
  const context = await loadPaymentCover(actor, leaseId); if (!context) notFound();
  const { lease, versions } = context;
  const version = versions.find(candidate => candidate.key === query.version) || versions.find(candidate => !candidate.current) || versions[0];
  const amount = (cents: number) => paymentCoverMoney(cents, lease.currency);
  return <Shell user={actor} taskPropertyId={lease.unit.propertyId} taskLeaseId={lease.id}><div className="page form-page">
    <div className="breadcrumb"><Link href={`/smlouvy/${lease.id}`}>← Zpět na smlouvu</Link></div>
    <div className="page-title"><div><span className="eyebrow">Dokumenty smlouvy</span><PageHeading>Platební list k dodatku</PageHeading><p>{context.tenantNames.join(" + ")} · {lease.unit.property.name} · {lease.unit.label}</p></div></div>
    <p>Samostatný titulní list s rozpisem a QR přiložte před dodatek. Čerpá z uloženého platebního nastavení; text dodatku a jeho podpisy zůstávají beze změny.</p>
    {!version ? <div className="notice"><strong>Pro platební list chybí úplné platné nastavení.</strong><span>Zkontrolujte ve smlouvě platnost a uložené nájemné i zálohy na služby.</span></div> : <>
      <form className="card edit-form" method="get"><label className="field"><span>Uložená platební verze</span><select name="version" defaultValue={version.key}>{versions.map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.current ? "Současná" : "Budoucí"} · {candidate.source === "CURRENT" ? "stav k " : "od "}{date(candidate.effectiveFrom + "T12:00:00Z")} · {amount(candidate.totalCents)} / měsíc</option>)}</select></label><div className="form-actions"><button className="secondary" type="submit">Zobrazit verzi</button></div></form>
      <section className="card"><div className="card-head"><div><span className="eyebrow">Pravidelná úhrada za celý měsíc</span><h2>{amount(version.totalCents)}</h2><p>{version.source === "CURRENT" ? "Stav k datu vystavení" : "Platební verze účinná od"} {date(version.effectiveFrom + "T12:00:00Z")}</p></div><a className="primary" href={`/api/leases/${lease.id}/payment-cover?version=${encodeURIComponent(version.key)}`}>Stáhnout platební list PDF</a></div>
        <div className="summary-list">{version.items.map((item, index) => <div key={`${item.kind}-${index}`}><span>{item.name}</span><strong>{amount(item.amountCents)}</strong></div>)}<div><span>Celkem měsíčně</span><strong>{amount(version.totalCents)}</strong></div><div><span>Účet pro úhradu</span><strong>{context.account}</strong></div><div><span>Variabilní symbol</span><strong>{lease.variableSymbol || "Neuveden"}</strong></div><div><span>Splatnost</span><strong>{lease.dueDay}. den {lease.rentTiming === "ARREARS" ? "následujícího" : "daného"} měsíce</strong></div></div>
        {!context.qrFor(version.totalCents) && version.totalCents > 0 && <p className="notice">QR nelze vytvořit: zkontrolujte platný účet v CZK, měnu smlouvy a číselný variabilní symbol. PDF obsahuje evidované údaje.</p>}
        <p className="muted-copy">Pravidelná částka nezahrnuje jistotu, dluhy ani případnou poměrnou první úhradu. Účet, variabilní symbol a splatnost odpovídají aktuálnímu nastavení při vystavení.</p>
      </section>
    </>}
  </div></Shell>;
}
