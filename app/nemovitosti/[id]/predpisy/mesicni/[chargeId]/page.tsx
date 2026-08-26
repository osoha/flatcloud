import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, unitAccessWhere } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Checkbox, Field, Flash, FormPage, Select, Textarea } from "@/components/FormUi";
import { dateInput, moneyInput } from "@/lib/forms";
import { money } from "@/lib/format";
import { chargeCategories } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function EditCharge({ params, searchParams }: { params: Promise<{ id: string; chargeId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, chargeId } = await params;
  const [property, charge, query] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.charge.findFirst({
      where: { id: chargeId, lease: { unit: unitAccessWhere(user, id) } },
      include: { items: true, allocations: true, lease: { include: { tenant: true, unit: true } } },
    }),
    searchParams,
  ]);
  if (!property || !charge) notFound();
  const paid = charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  const itemTotal = charge.items.reduce((sum, item) => sum + item.amountCents, 0);

  return <Shell user={user}><FormPage
    title={`Měsíční předpis ${charge.period}`}
    description={`${charge.lease.unit.label} · ${charge.lease.tenant.name}`}
    backHref={`/nemovitosti/${id}/predpisy/${charge.leaseId}`}
  >
    <Flash ok={query.ok} error={query.error}/>

    <div className="card" style={{marginBottom:16}}>
      <div className="card-head"><div><h2>Konkrétní předpis za {charge.period}</h2><p className="muted-copy">Úprava na této stránce platí jen pro tento měsíc. Pravidelnou šablonu nájemného a služeb tím neměníte.</p></div><span className={`status ${charge.active ? charge.manualOverride ? "warn" : "ok" : "bad"}`}>{charge.active ? charge.manualOverride ? "Ručně upraven" : "Podle šablony" : "Vypnutý"}</span></div>
      <div className="summary-list clickable-summary">
        <Link href={`/nemovitosti/${id}/jednotky/${charge.lease.unit.id}`}><span>Jednotka</span><strong>{charge.lease.unit.label} →</strong></Link>
        <Link href={`/nemovitosti/${id}/predpisy/${charge.leaseId}`}><span>Nájemní vztah / pravidelné položky</span><strong>{charge.lease.tenant.name} →</strong></Link>
      </div>
    </div>

    <div className="detail-grid">
      <div className="card col-8">
        <div className="card-head"><div><h2>Rozpad měsíčního předpisu</h2><p className="muted-copy">Celková částka se vždy dopočítává z položek. Pro jednorázovou slevu přidejte zápornou korekci, např. −5 000 Kč.</p></div></div>
        {charge.items.length ? <div className="stack-list">{charge.items.map((item) => <form key={item.id} action={`/api/properties/${id}/charges/${charge.id}/items/${item.id}`} method="post" className="inline-edit-card">
          <div className="inline-edit-grid">
            <Field label="Položka" name="name" defaultValue={item.name} required/>
            <Select label="Kategorie" name="category" defaultValue={item.category} options={Object.entries(chargeCategories)}/>
            <Field label="Částka Kč" name="amount" type="number" step="0.01" defaultValue={moneyInput(item.amountCents).replace(",", ".")} required/>
          </div>
          <div className="mini-actions"><button className="secondary" type="submit">Uložit položku</button><button className="text-button danger-text" type="submit" name="mode" value="delete">Odstranit</button></div>
        </form>)}</div> : <div className="table-empty">Předpis nemá žádné položky.</div>}

        <form action={`/api/properties/${id}/charges/${charge.id}/items`} method="post" className="inline-edit-card" style={{marginTop:14}}>
          <div className="card-head"><div><h2>Přidat jednorázovou položku</h2><p className="muted-copy">Sleva nebo korekce může být záporná. Celkový předpis nesmí klesnout pod již uhrazenou částku.</p></div></div>
          <div className="inline-edit-grid">
            <Field label="Název" name="name" placeholder="Např. Sleva za omezení užívání" required/>
            <Select label="Kategorie" name="category" defaultValue="ADJUSTMENT" options={Object.entries(chargeCategories)}/>
            <Field label="Částka Kč" name="amount" type="number" step="0.01" placeholder="-5000" required/>
          </div>
          <div className="mini-actions"><button className="primary" type="submit">Přidat položku</button></div>
        </form>
      </div>

      <div className="col-4 side-stack">
        <div className="card">
          <div className="card-head"><h2>Souhrn</h2></div>
          <div className="summary-list"><div><span>Součet položek</span><strong>{money(itemTotal)}</strong></div><div className="summary-total"><span>Předepsáno</span><strong>{money(charge.amountCents)}</strong></div><div><span>Uhrazeno</span><strong>{money(paid)}</strong></div><div><span>Zbývá</span><strong className={Math.max(0, charge.amountCents - paid) ? "negative" : "positive"}>{money(Math.max(0, charge.amountCents - paid))}</strong></div></div>
          {itemTotal !== charge.amountCents && <div className="notice" style={{marginTop:12}}>Součet položek se liší od uložené celkové částky. Upravte některou položku; nový součet se automaticky sjednotí.</div>}
        </div>

        <form className="card edit-form" action={`/api/properties/${id}/charges/${charge.id}`} method="post">
          <div className="card-head"><div><h2>Nastavení měsíce</h2><p className="muted-copy">Změna se označí jako ruční a automatický generátor ji nebude přepisovat.</p></div></div>
          <div className="form-grid">
            <Field label="Datum splatnosti" name="dueDate" type="date" defaultValue={dateInput(charge.dueDate)} required/>
            <Checkbox label="Předpis je aktivní pro tento měsíc" name="active" defaultChecked={charge.active} full/>
            <Textarea label="Poznámka / důvod úpravy" name="note" defaultValue={charge.note} full/>
          </div>
          <div className="form-actions"><button className="primary" type="submit">Uložit nastavení</button></div>
        </form>

        {charge.active && paid === 0 && <form className="card edit-form" action={`/api/properties/${id}/charges/${charge.id}`} method="post">
          <input type="hidden" name="mode" value="waive"/>
          <div className="card-head"><div><h2>Odpuštění předpisu</h2><p className="muted-copy">Vypne pouze tento měsíc. Historie zůstane zachována a automatika jej znovu nezapne.</p></div></div>
          <Field label="Důvod" name="note" placeholder="Např. nájemné za srpen odpuštěno"/>
          <div className="form-actions"><button className="secondary" type="submit">Odpustit / vypnout tento předpis</button></div>
        </form>}

        {charge.manualOverride && paid === 0 && <form className="card" action={`/api/properties/${id}/charges/${charge.id}`} method="post">
          <input type="hidden" name="mode" value="reset"/>
          <div className="card-head"><div><h2>Vrátit automatiku</h2><p className="muted-copy">Zahodí ruční úpravy tohoto měsíce a znovu sestaví předpis z pravidelných položek platných v daném období.</p></div></div>
          <button className="secondary full-button" type="submit">Obnovit podle pravidelné šablony</button>
        </form>}
      </div>
    </div>
  </FormPage></Shell>;
}
