"use client";

import { useState } from "react";
import { calculateCashflowScenario, cashflowCents, type CashflowIncomeMonth } from "@/lib/reporting/cashflow-scenario";
import { moneyExact } from "@/lib/format";

type Result = ReturnType<typeof calculateCashflowScenario>;
export function CashflowScenario({ months, source }: { months: CashflowIncomeMonth[]; source: string }) {
  const [result, setResult] = useState<{ input: string; value: Result } | null>(null);
  const [error, setError] = useState("");
  const fingerprint = JSON.stringify(months);
  const current = result?.input === fingerprint ? result.value : null;
  return <section className="card col-12" aria-label="Scénář cashflow" data-testid="cashflow-scenario"><h2>Scénář cashflow</h2>
    <p>Příjmy: {source}. Výpočet používá očekávané inkaso po vacancy a úspěšnosti inkasa z valorizace výše. MF ovlivňuje nájemní scénář, nepřičítá se znovu k příjmům.</p>
    <p>Náklady jsou vaše ručně zadané předpoklady pro celý vybraný rozsah. Uveďte nulu jen tam, kde výdaj neočekáváte. OPEX zadávejte bez splátek úvěrů a bez CAPEX, aby se výdaje nezapočítaly dvakrát. Dluhová služba zahrnuje jistinu a úrok; zůstatek jistiny není další měsíční výdaj.</p>
    <form className="form-grid" onChange={() => { setResult(null); setError(""); }} onSubmit={event => {
      event.preventDefault();
      try {
        const form = new FormData(event.currentTarget);
        const get = (name: string) => String(form.get(name) ?? "");
        const value = calculateCashflowScenario(months, { openingCashCents: cashflowCents(get("openingCash"), "Počáteční hotovost", true), monthlyOpexCents: cashflowCents(get("opex"), "OPEX"), annualOpexGrowthBps: cashflowCents(get("growth"), "Růst nákladů"), monthlyDebtServiceCents: cashflowCents(get("debt"), "Dluhová služba"), capexCents: cashflowCents(get("capex"), "CAPEX"), capexMonth: Number(get("capexMonth")) });
        setResult({ input: fingerprint, value }); setError("");
      } catch (cause) { setResult(null); setError(cause instanceof Error ? cause.message : "Výpočet se nezdařil."); }
    }}>
      <label className="field"><span>Počáteční hotovost v Kč</span><input name="openingCash" type="number" step="0.01" required/></label>
      <label className="field"><span>Měsíční OPEX v Kč</span><input name="opex" type="number" min="0" step="0.01" required/></label>
      <label className="field"><span>Roční růst OPEX v %</span><input name="growth" type="number" min="0" max="20" step="0.01" defaultValue="0" required/></label>
      <label className="field"><span>Měsíční dluhová služba v Kč</span><input name="debt" type="number" min="0" step="0.01" required/></label>
      <label className="field"><span>Jednorázový CAPEX v Kč</span><input name="capex" type="number" min="0" step="0.01" required/></label>
      <label className="field"><span>Měsíc CAPEX</span><select name="capexMonth" aria-label="Měsíc CAPEX" defaultValue="1">{months.map((month, index) => <option key={month.period} value={index + 1}>{month.period}</option>)}</select></label>
      <div className="form-actions"><button className="primary" type="submit">Spočítat cashflow</button></div>
    </form>
    <p className="muted-copy">Pracovní simulace se neukládá do schválené revize. Při změně vstupů ji přepočítejte; po obnovení stránky zadejte předpoklady znovu. Růst OPEX nastává po každých 12 měsících scénáře, dluhová služba je konstantní. Změny sazeb či splátek zohledněte vlastní variantou. Výpočet nezahrnuje jiné příjmy, daně ani výdaje, které jste nezadali.</p>
    {error && <p role="alert">{error}</p>}
    <div aria-live="polite">{current && <><h3>Výsledek scénáře · {months.length} měsíců</h3><div className="summary-list">{[["Očekávané inkaso", current.incomeCents], ["OPEX", current.opexCents], ["Dluhová služba", current.debtServiceCents], ["CAPEX", current.capexCents], ["Čisté cashflow", current.netCashflowCents], ["Konečná hotovost", current.closingCashCents], ["Nejnižší hotovost včetně počátku", current.minimumCashCents]].map(([label, value]) => <div key={String(label)}><span>{String(label)}</span><strong>{moneyExact(Number(value))}</strong></div>)}</div><p>{current.firstNegativePeriod ? `Záporná hotovost poprvé na konci měsíce ${current.firstNegativePeriod}.` : "Na konci žádného měsíce není hotovost záporná."} Kontrola uvnitř měsíce není součástí modelu.</p>
      <div className="table-wrap" role="region" aria-label="Měsíční cashflow; tabulku lze posouvat" tabIndex={0}><table><thead><tr>{["Měsíc", "Smluvní nájem (reference)", "Očekávané inkaso", "OPEX", "Dluhová služba", "CAPEX", "Čisté cashflow", "Hotovost na konci"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{current.months.map(row => <tr key={row.period}><th scope="row">{row.period}</th>{[row.contractualCents, row.expectedCollectedCents, row.opexCents, row.debtServiceCents, row.capexCents, row.netCashflowCents, row.cashBalanceCents].map((value, index) => <td key={index}>{moneyExact(value)}</td>)}</tr>)}</tbody></table></div></>}</div>
  </section>;
}
