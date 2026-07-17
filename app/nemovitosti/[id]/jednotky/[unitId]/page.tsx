import Link from "next/link";
import { notFound } from "next/navigation";
import { Gauge, Mail, Pencil, Phone, Plus, UserRound, UsersRound } from "lucide-react";
import { requireUser, canSeeAll } from "@/lib/auth";
import { requirePropertyAccess, requireUnitAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { money, date } from "@/lib/format";
import { dateInput } from "@/lib/forms";
import { currentPeriod } from "@/lib/period";
import { chargeDisplayState, chargeStateLabel, overdueDebtCents, paidCents } from "@/lib/charges";
import { meterTypes, unitStatuses, unitTypes } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function UnitDetail({ params, searchParams }: { params: Promise<{ id: string; unitId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, unitId } = await params;
  const [property, unit, query] = await Promise.all([requirePropertyAccess(user, id), requireUnitAccess(user, id, unitId), searchParams]);
  if (!property || !unit) notFound();
  const membership = property.memberships.find((row) => row.userId === user.id);
  const unitMembership = unit.userAccesses.find((row) => row.userId === user.id);
  const canManage = canSeeAll(user.role) || membership?.permission === "EDIT" || membership?.permission === "ADMIN" || unitMembership?.permission === "EDIT" || unitMembership?.permission === "ADMIN";
  const activeLease = unit.leases.find((lease) => lease.status === "ACTIVE") || unit.leases[0];
  const owner = unit.ownerships[0]?.owner || property.owner;
  const allCharges = unit.leases.flatMap((lease) => lease.charges);
  const overdueDebt = allCharges.reduce((sum, charge) => sum + overdueDebtCents(charge), 0);
  type UnitTransaction = (typeof allCharges)[number]["allocations"][number]["transaction"];
  const transactionMap = new Map<string, UnitTransaction>();
  for (const charge of allCharges) for (const allocation of charge.allocations) transactionMap.set(allocation.transaction.id, allocation.transaction);
  const transactions = Array.from(transactionMap.values()).sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime());
  const tenant = activeLease?.tenant;
  const primaryEmail = tenant?.type === "COMPANY" ? tenant.communicationEmail || tenant.billingEmail || tenant.email : tenant?.email;
  const primaryAddress = tenant?.type === "COMPANY" ? tenant.billingAddress || tenant.address : tenant?.permanentAddress || tenant?.address;
  const recurringCharge = activeLease ? activeLease.paymentItems.filter((item) => item.active).reduce((sum, item) => sum + item.amountCents, 0) : 0;
  const statusTone = unit.status === "OCCUPIED" ? "occupied" : unit.status === "VACANT" ? "vacant" : unit.status === "RENOVATION" ? "renovation" : "inactive";

  return <Shell user={user}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={`/nemovitosti/${id}/prehled`}>{property.name}</Link><span>›</span><Link href={`/nemovitosti/${id}/jednotky`}>Jednotky</Link><span>›</span><span>{unit.label}</span></div>
    <div className="unit-hero card"><div><span className="eyebrow">{unitTypes[unit.type]}</span><h1>{unit.label}</h1><p>{property.name} · {unit.floor || "podlaží neuvedeno"} · {unit.areaM2 ? `${unit.areaM2} m²` : "plocha neuvedena"}</p></div><div className="action-row">{canManage && <Link className="secondary" href={`/nemovitosti/${id}/jednotky/${unit.id}/upravit`}><Pencil size={15}/> Upravit jednotku</Link>}{canManage && <Link className="primary" href={`/nemovitosti/${id}/smlouvy/nova?unitId=${unit.id}`}><Plus size={15}/> Nová smlouva</Link>}</div></div>
    <Flash ok={query.ok} error={query.error}/>
    <nav className="unit-tabs"><a href="#prehled">Přehled</a>{activeLease && <><a href="#predpisy">Předpisy</a><a href="#platby">Platby</a><a href="#smlouva">Smlouva</a><a href="#osoby">Osoby</a></>}<a href="#meridla">Měřidla</a></nav>
    <div id="prehled" className="unit-kpi-grid">
      <div className={`card mini-kpi status-kpi status-${statusTone}`}><span>Stav</span><strong>{unitStatuses[unit.status]}</strong></div>
      <Link className="card mini-kpi mini-kpi-link" href={`/vlastnici/${owner.id}`}><span>Vlastník</span><strong>{owner.name}</strong><b className="mini-kpi-arrow">→</b></Link>
      {activeLease ? <Link className="card mini-kpi mini-kpi-link" href={`/nemovitosti/${id}/najemnici/${activeLease.tenant.id}/upravit`}><span>Nájemník</span><strong>{activeLease.tenant.name}</strong><b className="mini-kpi-arrow">→</b></Link> : <div className="card mini-kpi"><span>Nájemník</span><strong>Volná jednotka</strong></div>}
      {activeLease ? <Link className="card mini-kpi mini-kpi-link" href={`/nemovitosti/${id}/predpisy/${activeLease.id}`}><span>Aktuální předpis</span><strong>{money(recurringCharge)}</strong><b className="mini-kpi-arrow">→</b></Link> : <div className="card mini-kpi"><span>Aktuální předpis</span><strong>—</strong></div>}
      {activeLease ? <a className="card mini-kpi mini-kpi-link" href="#platby"><span>Dluh po splatnosti</span><strong className={overdueDebt ? "negative" : "positive"}>{money(overdueDebt)}</strong><b className="mini-kpi-arrow">↓</b></a> : <div className="card mini-kpi"><span>Dluh po splatnosti</span><strong className="positive">{money(0)}</strong></div>}
    </div>

    {activeLease ? <>
      <div className="detail-grid">
        <div id="predpisy" className="card col-7"><div className="card-head"><div><h2>Předpisy a úhrady</h2><p className="muted-copy">Dluh vzniká až následující den po splatnosti. Budoucí neuhrazené předpisy jsou pouze předepsané.</p></div>{canManage && <form action={`/api/properties/${id}/units/${unit.id}/charges/generate`} method="post" className="unit-charge-form"><input type="month" name="period" defaultValue={currentPeriod()} required/><button className="primary" type="submit"><Plus size={15}/> Přidat předpis</button></form>}</div>
          <div className="table-wrap"><table><thead><tr><th>Období</th><th>Splatnost</th><th>Předpis</th><th>Uhrazeno</th><th>Saldo</th><th>Stav</th><th></th></tr></thead><tbody>{activeLease.charges.length ? activeLease.charges.map((charge) => {
            const paid = paidCents(charge);
            const balance = paid - charge.amountCents;
            const state = chargeDisplayState(charge);
            const stateClass = state === "paid" ? "ok" : state === "overdue" ? "bad" : state === "partial" || state === "scheduled" ? "warn" : "";
            const href = `/nemovitosti/${id}/predpisy/mesicni/${charge.id}`;
            return <tr key={charge.id} className={`clickable-table-row ${!charge.active ? "row-disabled" : state === "overdue" ? "row-debt" : ""}`}>
              <td><Link className="row-cell-link entity-link" href={href}>{charge.period}</Link></td>
              <td><Link className="row-cell-link" href={href}>{date(charge.dueDate)}</Link></td>
              <td><Link className="row-cell-link money" href={href}>{money(charge.amountCents)}</Link></td>
              <td><Link className="row-cell-link money" href={href}>{money(paid)}</Link></td>
              <td><Link className={`row-cell-link money ${state === "overdue" ? "negative" : paid >= charge.amountCents ? "positive" : ""}`} href={href}>{money(balance)}</Link></td>
              <td><Link className="row-cell-link" href={href}><span className={`status ${stateClass}`}>{chargeStateLabel(state)}</span></Link></td>
              <td><Link className="row-cell-link table-link" href={href}>Detail</Link></td>
            </tr>;
          }) : <tr><td colSpan={7} className="table-empty">Zatím nebyly vytvořeny žádné měsíční předpisy.</td></tr>}</tbody></table></div>
        </div>
        <div id="smlouva" className="card col-5"><div className="card-head"><div><h2>Nájemní vztah</h2><p className="muted-copy">{activeLease.status === "ACTIVE" ? "Aktivní smlouva" : activeLease.status === "FUTURE" ? "Budoucí smlouva" : "Ukončená smlouva"}</p></div>{canManage && <Link className="icon-link" href={`/nemovitosti/${id}/smlouvy/${activeLease.id}/upravit`}><Pencil size={15}/></Link>}</div><div className="summary-list"><div><span>Nájemník</span><strong>{activeLease.tenant.name}</strong></div><div><span>Číslo smlouvy</span><strong>{activeLease.contractNumber || "Bez čísla"}</strong></div><div><span>Doba trvání</span><strong>{activeLease.endDate ? "Na dobu určitou" : "Na dobu neurčitou"}</strong></div><div><span>Platnost</span><strong>{date(activeLease.startDate)} – {activeLease.endDate ? date(activeLease.endDate) : "neurčito"}</strong></div><div><span>Splatnost</span><strong>{activeLease.dueDay}. den · {activeLease.rentTiming === "ARREARS" ? "zpětně" : "dopředně"}</strong></div><div><span>Variabilní symbol</span><strong>{activeLease.variableSymbol}</strong></div></div>
          <div className="contact-lines"><a href={`mailto:${primaryEmail || ""}`} className={!primaryEmail ? "disabled-link" : ""}><Mail size={15}/>{primaryEmail || "E-mail neuveden"}</a><a href={`tel:${tenant?.phone || ""}`} className={!tenant?.phone ? "disabled-link" : ""}><Phone size={15}/>{tenant?.phone || "Telefon neuveden"}</a></div>
        </div>
      </div>

      <div id="osoby" className="card unit-module-card"><div className="card-head"><div><h2>Osoby v bytě</h2><p className="muted-copy">Hlavní nájemník a další osoby evidované k tomuto nájemnímu vztahu.</p></div>{canManage && <Link className="secondary" href={`/nemovitosti/${id}/najemnici/${tenant!.id}/upravit`}><Pencil size={15}/> Upravit hlavní osobu</Link>}</div>
        <div className="people-grid"><Link className="person-card main-person main-person-link" href={`/nemovitosti/${id}/najemnici/${tenant!.id}/upravit`}><div className="person-icon"><UserRound size={18}/></div><div><span className="eyebrow">{tenant!.type === "COMPANY" ? "Hlavní nájemce – firma" : "Hlavní nájemník"}</span><h3>{tenant!.name}</h3><div className="person-details person-business-card">{tenant!.ico && <span>IČO {tenant!.ico}</span>}{primaryEmail && <span><Mail size={13}/>{primaryEmail}</span>}{tenant!.billingEmail && tenant!.billingEmail !== primaryEmail && <span><Mail size={13}/>Fakturace: {tenant!.billingEmail}</span>}{tenant!.phone && <span><Phone size={13}/>{tenant!.phone}</span>}{primaryAddress && <span>{primaryAddress}</span>}{tenant!.correspondenceAddress && <span>Korespondence: {tenant!.correspondenceAddress}</span>}{tenant!.note && <span>Poznámka: {tenant!.note}</span>}</div><b className="person-card-arrow">Otevřít detail →</b></div></Link>
          {activeLease.occupants.map((occupant) => <details className={`person-card occupant-card ${occupant.active ? "" : "inactive"}`} key={occupant.id}><summary><div className="person-icon"><UsersRound size={18}/></div><div><span className="eyebrow">Další osoba</span><h3>{occupant.name}</h3><small>{occupant.email || occupant.phone || (occupant.active ? "Aktivní" : "Neaktivní")}</small></div></summary><div className="person-details expanded">{occupant.email && <a href={`mailto:${occupant.email}`}>{occupant.email}</a>}{occupant.phone && <a href={`tel:${occupant.phone}`}>{occupant.phone}</a>}{occupant.permanentAddress && <span>{occupant.permanentAddress}</span>}{occupant.correspondenceAddress && <span>Korespondence: {occupant.correspondenceAddress}</span>}{occupant.note && <span>{occupant.note}</span>}</div>{canManage && <form className="compact-form occupant-edit-form" action={`/api/properties/${id}/units/${unit.id}/occupants/${occupant.id}`} method="post"><label className="field"><span>Jméno</span><input name="name" defaultValue={occupant.name} required/></label><label className="field"><span>E-mail</span><input name="email" type="email" defaultValue={occupant.email || ""}/></label><label className="field"><span>Telefon</span><input name="phone" defaultValue={occupant.phone || ""}/></label><label className="field"><span>Trvalá adresa</span><input name="permanentAddress" defaultValue={occupant.permanentAddress || ""}/></label><label className="field"><span>Korespondenční adresa</span><input name="correspondenceAddress" defaultValue={occupant.correspondenceAddress || ""}/></label><label className="field field-full"><span>Poznámka</span><textarea name="note" defaultValue={occupant.note || ""}/></label><label className="checkbox-field field-full"><input type="checkbox" name="active" defaultChecked={occupant.active}/><span>Aktivní osoba</span></label><div className="mini-actions field-full"><button className="secondary" type="submit">Uložit</button><button className="danger-button" type="submit" name="mode" value="delete">Odebrat</button></div></form>}</details>)}
        </div>
        {canManage && <details className="module-add"><summary><Plus size={15}/> Přidat další osobu</summary><form className="compact-form module-form" action={`/api/properties/${id}/units/${unit.id}/occupants`} method="post"><input type="hidden" name="leaseId" value={activeLease.id}/><label className="field"><span>Jméno a příjmení</span><input name="name" required/></label><label className="field"><span>E-mail</span><input name="email" type="email"/></label><label className="field"><span>Telefon</span><input name="phone"/></label><label className="field"><span>Trvalá adresa</span><input name="permanentAddress"/></label><label className="field"><span>Korespondenční adresa</span><input name="correspondenceAddress"/></label><label className="field field-full"><span>Poznámka ke kontaktu</span><textarea name="note"/></label><button className="primary field-full" type="submit">Přidat osobu</button></form></details>}
      </div>

      <div id="platby" className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Došlé platby jednotky</h2><p>Platby přiřazené k předpisům této jednotky.</p></div></div><div className="table-wrap"><table><thead><tr><th>Datum</th><th>Plátce</th><th>VS</th><th>Částka</th><th>Poznámka</th></tr></thead><tbody>{transactions.length ? transactions.map((transaction) => <tr key={transaction.id}><td>{date(transaction.bookedAt)}</td><td>{transaction.counterpartyName || "Neznámý plátce"}</td><td>{transaction.variableSymbol || "—"}</td><td className="money">{money(transaction.amountCents)}</td><td>{transaction.message || "Automaticky / ručně spárováno"}</td></tr>) : <tr><td colSpan={5} className="table-empty">K jednotce zatím není přiřazena žádná platba.</td></tr>}</tbody></table></div></div>
    </> : <div className="card empty-state"><UserRound size={28}/><h2>Jednotka nemá aktivní ani historickou smlouvu</h2><p>Měřidla lze evidovat i před uzavřením první nájemní smlouvy.</p></div>}

      <div id="meridla" className="card unit-module-card"><div className="card-head"><div><h2>Měřidla a odečty</h2><p className="muted-copy">Studená a teplá voda, elektřina VT/NT a plyn. Odečet se ukládá i k nájemnímu vztahu platnému v době zadání.</p></div><Gauge size={20}/></div>
        <div className="meter-grid">{unit.meters.length ? unit.meters.map((meter) => { const latest = meter.readings[0]; return <div className={`meter-card ${meter.active ? "" : "inactive"}`} key={meter.id}><div className="meter-card-head"><div><span className="eyebrow">{meterTypes[meter.type]}</span><h3>{meter.label || meterTypes[meter.type]}</h3><small>{meter.serialNumber ? `Sériové číslo ${meter.serialNumber}` : "Bez sériového čísla"}</small></div><div className="meter-value"><strong>{latest ? latest.value.toLocaleString("cs-CZ") : "—"}</strong><span>{meter.unitOfMeasure}</span><small>{latest ? date(latest.readAt) : "Bez odečtu"}</small></div></div>{meter.readings.length ? <div className="meter-history">{meter.readings.slice(0, 5).map((reading) => <div key={reading.id}><span>{date(reading.readAt)}</span><strong>{reading.value.toLocaleString("cs-CZ")} {meter.unitOfMeasure}</strong><small>{reading.lease ? reading.lease.tenant.name : "Bez vazby na smlouvu"}{reading.note ? ` · ${reading.note}` : ""}</small></div>)}</div> : <div className="table-empty">Zatím bez odečtu</div>}{canManage && <><form className="meter-reading-form" action={`/api/properties/${id}/units/${unit.id}/meters/${meter.id}/readings`} method="post">{activeLease && <input type="hidden" name="leaseId" value={activeLease.id}/>}<label className="field"><span>Datum</span><input type="date" name="readAt" defaultValue={dateInput(new Date())} required/></label><label className="field"><span>Nový stav ({meter.unitOfMeasure})</span><input type="number" name="value" step="0.001" min="0" required/></label><label className="field"><span>Poznámka</span><input name="note"/></label><button className="primary" type="submit">Uložit odečet</button></form><form action={`/api/properties/${id}/units/${unit.id}/meters/${meter.id}`} method="post" className="meter-toggle-form"><input type="hidden" name="mode" value="toggle"/><button className="link-button" type="submit">{meter.active ? "Vyřadit měřidlo" : "Znovu aktivovat"}</button></form></>}</div>; }) : <div className="empty-state compact-empty"><Gauge size={24}/><p>Zatím nejsou evidována žádná měřidla.</p></div>}</div>
        {canManage && <details className="module-add"><summary><Plus size={15}/> Přidat měřidlo</summary><form className="compact-form module-form" action={`/api/properties/${id}/units/${unit.id}/meters`} method="post"><label className="field"><span>Typ měřidla</span><select name="type">{Object.entries(meterTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Vlastní označení</span><input name="label" placeholder="např. Bytový vodoměr"/></label><label className="field"><span>Sériové číslo</span><input name="serialNumber"/></label><label className="field"><span>Jednotka</span><input name="unitOfMeasure" placeholder="Automaticky m³ nebo kWh"/></label><button className="primary field-full" type="submit">Přidat měřidlo</button></form></details>}
      </div>
  </div></Shell>;
}
