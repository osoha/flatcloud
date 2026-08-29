import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormPage, Select, Textarea } from "@/components/FormUi";
import { dateInput, moneyInput } from "@/lib/forms";
import { date } from "@/lib/format";
import { outstandingCents } from "@/lib/charges";
import { loadEditablePaymentLeases, paymentLeaseOptionLabel } from "@/lib/payment-lease-options";

export const dynamic = "force-dynamic";

type Search = { ok?: string; error?: string; leaseId?: string };

export default async function GlobalManualPayment({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const query = await searchParams;
  const sorted = await loadEditablePaymentLeases(user);
  if (!sorted.length && query.leaseId) redirect("/platby/nova");

  return <Shell user={user}><FormPage title="Přidat ruční platbu" description="Platbu lze přiřadit ke kterémukoli nájemnímu vztahu ve vaší správě, včetně ukončených smluv a historických nájemních vztahů." backHref="/portfolio"><Flash ok={query.ok} error={query.error}/>{sorted.length?<form className="card edit-form" action="/api/payments/manual" method="post"><div className="form-grid"><Select label="Nájemní vztah / byt" name="leaseId" required full defaultValue={query.leaseId || sorted[0]?.id} options={sorted.map((lease) => {
    const outstanding = lease.charges.reduce((sum, charge) => sum + outstandingCents(charge), 0);
    return [lease.id, `${paymentLeaseOptionLabel(lease)} · neuhrazeno ${moneyInput(outstanding)} Kč`];
  })}/><div className="field-full notice payment-allocation-note"><strong>Automatické přiřazení</strong><span>Částka se rozdělí na nejstarší neuhrazené předpisy vybraného vztahu. Případný přeplatek zůstane vedený u stejné smlouvy.</span></div><Field label="Datum přijetí" name="bookedAt" type="date" defaultValue={dateInput(new Date())} required/><Field label="Částka Kč" name="amount" type="number" step="0.01" min={0} required/><Field label="Jméno plátce" name="counterpartyName" placeholder="Při nevyplnění se použije nájemník"/><Field label="Variabilní symbol" name="variableSymbol"/><Textarea label="Poznámka" name="message" placeholder={`Ruční evidence platby vytvořená ${date(new Date())}`}/></div><div className="form-actions"><a className="secondary" href="/portfolio">Zrušit</a><button className="primary" type="submit">Uložit a přiřadit platbu</button></div></form>:<div className="card empty-state"><h2>Nemáte žádný nájemní vztah s právem editace</h2><p>Ruční platbu může přidat administrátor, správce nebo uživatel s oprávněním EDIT / ADMIN k objektu či jednotce.</p></div>}</FormPage></Shell>;
}
