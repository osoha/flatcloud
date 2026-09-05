import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Field, Flash, Textarea } from "@/components/FormUi";
import { requireUser } from "@/lib/auth";
import { leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { dateValue, moneyInput, moneyToCents } from "@/lib/forms";
import { previewLeaseFinancialChange } from "@/lib/lease-financial-change";

export const dynamic = "force-dynamic";

function nextMonthInput() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12)).toISOString().slice(0, 10); }

export default async function LeaseFinancialChangePage({ params, searchParams }: { params: Promise<{ leaseId: string }>; searchParams: Promise<{ rent?: string; services?: string; effectiveFrom?: string; reason?: string; preview?: string; error?: string }> }) {
  const user = await requireUser();
  const [{ leaseId }, query] = await Promise.all([params, searchParams]);
  const lease = await prisma.lease.findFirst({ where: { id: leaseId, AND: leaseAccessWhere(user) }, include: { tenant: true, unit: { include: { property: true } }, paymentItems: true, charges: { include: { items: true, allocations: true, securityDepositOffsets: true, creditApplications: true } } } });
  if (!lease) notFound();
  let preview: Awaited<ReturnType<typeof previewLeaseFinancialChange>> | null = null;
  let previewError: string | null = null;
  if (query.preview === "1") {
    try {
      const form = new FormData(); form.set("rent", query.rent || ""); form.set("services", query.services || ""); form.set("effectiveFrom", query.effectiveFrom || "");
      preview = await previewLeaseFinancialChange(user, lease.unit.propertyId, leaseId, { rentCents: moneyToCents(form, "rent"), servicesCents: moneyToCents(form, "services"), effectiveFrom: dateValue(form, "effectiveFrom", true)!, reason: query.reason || "" });
    } catch (error) { previewError = error instanceof Error ? error.message : "Náhled se nepodařilo připravit."; }
  }
  const currentRent = preview?.current.rent.amountCents ?? lease.rentCents;
  const currentServices = preview?.current.services.amountCents ?? lease.servicesCents;
  return <Shell user={user}><div className="page form-page rent-change-proposal-page">
    <div className="breadcrumb"><Link href={`/smlouvy/${leaseId}`}>← Zpět na smlouvu</Link></div>
    <div className="page-title"><div><span className="eyebrow">Finance smlouvy · bezpečná změna</span><h1>Změnit nájemné a služby</h1><p>{lease.unit.property.name} · {lease.unit.label} · {lease.tenant.name}</p></div></div>
    <Flash error={query.error || previewError || undefined}/>
    <div className="notice"><strong>Historie se nepřepisuje</strong><span>Změna může platit nejdříve od příštího měsíce. Minulé, aktuální, uhrazené a ručně upravené předpisy zůstanou beze změny.</span></div>
    {!preview ? <form className="card edit-form" method="get"><input type="hidden" name="preview" value="1"/><div className="form-grid">
      <Field label="Nové nájemné Kč / měsíc" name="rent" type="number" min={0} step="0.01" required defaultValue={query.rent ?? moneyInput(currentRent).replace(",", ".")}/>
      <Field label="Nové služby Kč / měsíc" name="services" type="number" min={0} step="0.01" required defaultValue={query.services ?? moneyInput(currentServices).replace(",", ".")}/>
      <Field label="Účinnost od prvního dne měsíce" name="effectiveFrom" type="date" min={nextMonthInput()} required defaultValue={query.effectiveFrom || nextMonthInput()}/>
      <Textarea label="Důvod změny" name="reason" required defaultValue={query.reason} placeholder="Dodatek, změna záloh na služby nebo jiné doložitelné rozhodnutí"/>
    </div><div className="form-actions"><Link className="secondary" href={`/smlouvy/${leaseId}`}>Zrušit</Link><button className="primary" type="submit">Zkontrolovat dopad</button></div></form> : <div className="card rent-change-review">
      <div className="card-head"><div><span className="eyebrow">Druhý krok · kontrola před uložením</span><h2>Dopad změny</h2><p className="muted-copy">Od {date(preview.input.effectiveFrom)} se přepočítají pouze budoucí automatické předpisy.</p></div><span className="status warn">Čeká na potvrzení</span></div>
      <div className="rent-change-amounts"><span><small>Dnešní nájem + služby</small><strong>{money(preview.current.rent.amountCents + preview.current.services.amountCents)}</strong><em>{money(preview.current.rent.amountCents)} + {money(preview.current.services.amountCents)}</em></span><b aria-hidden="true">→</b><span><small>Nový nájem + služby</small><strong>{money(preview.input.rentCents + preview.input.servicesCents)}</strong><em>{money(preview.input.rentCents)} + {money(preview.input.servicesCents)}</em></span></div>
      <div className="summary-list"><div><span>Účinnost</span><strong>{date(preview.input.effectiveFrom)}</strong></div><div><span>Budoucí předpisy k přepočtu</span><strong>{preview.affectedCharges.length}{preview.affectedCharges.length ? ` · ${preview.affectedCharges.map((row) => row.period).join(", ")}` : " · dosud nevytvořené"}</strong></div><div><span>Důvod</span><strong>{preview.input.reason}</strong></div></div>
      <form className="rent-change-confirm" action={`/api/properties/${lease.unit.propertyId}/leases/${leaseId}/financial-change`} method="post"><input type="hidden" name="rent" value={preview.input.rentCents / 100}/><input type="hidden" name="services" value={preview.input.servicesCents / 100}/><input type="hidden" name="effectiveFrom" value={preview.input.effectiveFrom.toISOString().slice(0, 10)}/><input type="hidden" name="reason" value={preview.input.reason}/><label className="checkbox-field"><input type="checkbox" name="confirm"/><span>Zkontroloval/a jsem částky, účinnost, důvod a seznam dotčených předpisů.</span></label><div className="form-actions"><Link className="secondary" href={`/smlouvy/${leaseId}/finance/upravit`}>Upravit zadání</Link><button className="primary" type="submit">Potvrdit budoucí změnu</button></div></form>
    </div>}
  </div></Shell>;
}
