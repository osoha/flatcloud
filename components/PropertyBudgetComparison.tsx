import { comparePropertyBudget, type BudgetInput, type CostInput } from "@/lib/property-budget-comparison";
import { propertyCostCategories, propertyCostKinds } from "@/lib/asset-finance";
import { moneyExact } from "@/lib/format";

export function PropertyBudgetComparison({ budgets, costs, year }: { budgets: BudgetInput[]; costs: CostInput[]; year: number }) {
  const rows = comparePropertyBudget(budgets, costs, year);
  return <section className="card col-12 portfolio-table-card" aria-labelledby="budget-comparison-title" data-testid="budget-comparison">
    <div className="table-toolbar"><div>
      <h2 id="budget-comparison-title">Rozpočet a čerpání podle kategorií · {year}</h2>
      <p>Porovnání podle typu a kategorie, nikoli párování jednotlivých faktur s rozpočtovými položkami. Přebytek jiné kategorie nezakryje překročení.</p>
    </div></div>
    <p className="muted-copy">Zbývá = rozpočet − objednáno − skutečnost. Pracovní plán je uveden samostatně a rozpočet nečerpá. Skutečnost znamená evidovaný náklad, nikoli potvrzení úhrady. Bez rozpočtové položky nelze určit zbývající limit.</p>
    {rows.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Porovnání rozpočtu; širokou tabulku lze posouvat">
      <table><caption>Částky v Kč za rok {year}</caption><thead><tr>{["Typ", "Kategorie", "Rozpočet", "Pracovní plán", "Objednáno", "Skutečnost", "Zbývá", "Vyhodnocení"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.kind}:${row.category}`}>
          <td>{propertyCostKinds[row.kind]}</td><th scope="row">{propertyCostCategories[row.category]}</th>
          <td>{row.budgetLines ? moneyExact(row.budgetCents) : "—"}</td><td>{moneyExact(row.plannedCents)}</td><td>{moneyExact(row.committedCents)}</td><td>{moneyExact(row.actualCents)}</td>
          <td className={row.remainingCents != null && row.remainingCents < 0 ? "negative" : undefined}>{row.remainingCents == null ? "—" : moneyExact(row.remainingCents)}</td>
          <td>{row.remainingCents == null ? "Bez rozpočtu" : row.remainingCents < 0 ? "Překročeno" : row.remainingCents === 0 ? "Vyčerpáno" : "V limitu"}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="table-empty">Pro tento rok nejsou evidovány rozpočtové položky ani náklady.</p>}
  </section>;
}
