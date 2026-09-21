import Link from "next/link";
import { DismissibleDetails } from "@/components/DismissibleDetails";
import { distributionOpportunityStages } from "@/lib/distribution/crm";
import { nextActionFilters, nextActionState, type OverviewProspect, type ProspectFilters } from "@/lib/distribution/prospect-overview";
import { date } from "@/lib/format";

type Prospect = Omit<OverviewProspect, "opportunities"> & {
  opportunities: (OverviewProspect["opportunities"][number] & { note: string | null })[];
};
type Property = { id: string; name: string; units: { id: string; label: string }[] };

export function ProspectDirectory({ prospects, properties, filters, today, total }: {
  prospects: Prospect[]; properties: Property[]; filters: ProspectFilters; today: string; total: number;
}) {
  const count = prospects.reduce((sum, prospect) => sum + prospect.opportunities.length, 0);
  return <section className="card portfolio-table-card crm-directory" id="adresar" aria-labelledby="prospect-directory-title">
    <div className="table-toolbar"><div>
      <h2 id="prospect-directory-title">Přehled zájemců</h2>
      <p>Kontakt, jeho jednotky a další kroky na jednom místě. Kontakty lze vést i bez nabídky.</p>
    </div><Link className="secondary" href="/distribuce/zajemci?newContact=1#novy-zajemce">Nový kontakt</Link></div>
    <form className="crm-directory-filters" method="get" action="/distribuce/zajemci#adresar" aria-label="Filtry zájemců">
      <label className="field"><span>Hledat kontakt</span><input name="q" type="search" defaultValue={filters.q} placeholder="Jméno, e-mail, telefon nebo zdroj" /></label>
      <label className="field"><span>Dům</span><select name="propertyId" defaultValue={filters.propertyId}><option value="">Všechny domy</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="field"><span>Jednotka</span><select name="unitId" defaultValue={filters.unitId}><option value="">Všechny jednotky</option>{properties.map(p => <optgroup key={p.id} label={p.name}>{p.units.map(u => <option key={u.id} value={u.id}>{p.name} · {u.label}</option>)}</optgroup>)}</select></label>
      <label className="field"><span>Fáze příležitosti</span><select name="stage" defaultValue={filters.stage}><option value="">Všechny fáze</option>{Object.entries(distributionOpportunityStages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Termín dalšího kroku</span><select name="due" defaultValue={filters.due}><option value="">Všechny termíny</option>{Object.entries(nextActionFilters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="action-row crm-directory-filter-actions"><label className="checkbox-field"><input type="checkbox" name="unassigned" value="1" defaultChecked={filters.unassigned} /> Bez příležitosti v přehledu</label><button className="secondary">Použít filtry</button><Link href="/distribuce/zajemci#adresar">Zrušit filtry</Link></div>
    </form>
    <p className="crm-directory-count" role="status">Zobrazené kontakty: {prospects.length} z {total} · Příležitosti ve výběru: {count}</p>
    <div className="table-wrap"><table aria-label="Přehled zájemců a jejich příležitostí">
      <thead><tr><th scope="col">Zájemce a kontakt</th><th scope="col">Zdroj a poznámka</th><th scope="col">Jednotky, fáze a další krok</th><th scope="col">Akce kontaktu</th></tr></thead>
      <tbody>{prospects.map(p => <tr key={p.id} data-prospect-id={p.id}>
        <th scope="row" className="crm-contact-cell"><strong>{p.name}</strong>{p.email && <span>{p.email}</span>}{p.phone && <span>{p.phone}</span>}</th>
        <td className="crm-contact-note"><strong>{p.source || "Zdroj neuveden"}</strong><p>{p.note || "Bez poznámky"}</p></td>
        <td className="crm-opportunities-cell">{p.opportunities.length ? <ul className="crm-contact-opportunities">{p.opportunities.map(item => {
          const state = nextActionState(item, today);
          return <li key={item.id} data-opportunity-id={item.id}>
            <div className="crm-opportunity-summary"><Link className="entity-link" href={`/nemovitosti/${item.unit.property.id}/jednotky/${item.unit.id}`}>{item.unit.property.name} · {item.unit.label}</Link><span className={`status ${item.stage === "WON" ? "ok" : item.stage === "RESERVED" ? "warn" : ""}`}>{distributionOpportunityStages[item.stage]}</span></div>
            <div className={state === "overdue" ? "negative" : ""}>Další krok: {item.nextActionAt ? date(item.nextActionAt) : "Nenastaven"}{state === "overdue" ? " · Po termínu" : state === "today" ? " · Dnes" : state === "closed" ? " · Uzavřená příležitost" : ""}</div>
            {item.note && <p className="crm-opportunity-note">{item.note}</p>}
            <a href={`#prilezitost-${item.id}`} className="crm-opportunity-detail">Detail a úprava příležitosti</a>
          </li>;
        })}</ul> : <span>Bez příležitosti v přehledu</span>}</td>
        <td><div className="crm-contact-actions"><Link href={`/distribuce/zajemci?prospectId=${encodeURIComponent(p.id)}#nova-prilezitost`}>Přidat příležitost</Link><DismissibleDetails viewportModal summary="Upravit kontakt" dialogLabel={`Upravit kontakt: ${p.name}`}><form className="form-grid" action={`/api/distribution/prospects/${p.id}`} method="post">
          {[["name", "Jméno", p.name], ["email", "E-mail", p.email], ["phone", "Telefon", p.phone], ["source", "Zdroj", p.source]].map(([name, label, value]) => <label className="field" key={name}><span>{label}</span><input name={name!} defaultValue={value || ""} type={name === "email" ? "email" : "text"} required={name === "name"} maxLength={250} /></label>)}
          <label className="field field-full"><span>Poznámka</span><textarea name="note" defaultValue={p.note || ""} maxLength={2000} /></label><button className="primary field-full">Uložit kontakt</button>
        </form></DismissibleDetails></div></td>
      </tr>)}{!prospects.length && <tr><td colSpan={4} className="table-empty">Žádné kontakty neodpovídají výběru. Zkuste zrušit filtry.</td></tr>}</tbody>
    </table></div>
    <p className="crm-directory-hint">Filtry se kombinují nad stejnou příležitostí. Termíny zahrnují jen otevřené příležitosti; příštích 7 dní začíná zítřkem. Přehled zahrnuje aktivní domy interní distribuce.</p>
  </section>;
}
