import { money } from '@/lib/format';
import type { SettlementEvidenceRow } from '@/lib/settlement-cost-projection';

export function SettlementEvidenceTable({ rows }: { rows: SettlementEvidenceRow[] }) {
  if (!rows.length) return null;
  return <section className="card settlement-source-card"><h2>Potvrzené podklady po službách</h2>
    <p className="muted-copy">Použita je poslední potvrzená verze. Náklad řádku zahrnuje jeho složky; souhrny a zálohy dodavateli se znovu nepřičítají.</p>
    <div className="table-wrap"><table><thead><tr><th>Služba a doklad</th><th>Období nákladu</th><th>Verze</th><th>Náklad smlouvy</th><th>Převzetí</th><th>Složky ze zdroje</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.title}</strong><br/>{row.lineKey}</td><td>{row.from} – {row.to}</td><td>v{row.version}</td><td>{money(row.amountCents)}</td><td>{row.allocationLabel}</td><td>
        {row.components.base && <div>Základní: {row.components.base} Kč</div>}
        {row.components.consumption && <div>Spotřební: {row.components.consumption} Kč</div>}
        {row.components.correction && <div>Korekce: {row.components.correction} Kč</div>}
        {row.components.rounding && <div>Zaokrouhlení: {row.components.rounding} Kč</div>}
        {!Object.entries(row.components).some(([key,value]) => key !== 'complete' && value) && 'Zdroj neuvádí'}
      </td></tr>)}</tbody></table></div>
  </section>;
}
