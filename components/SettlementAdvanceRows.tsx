import { moneyExact } from "@/lib/format";

export function SettlementAdvanceRows({ rows }: { rows: Array<{ period: string; amountCents: number; items?: Array<{ name: string; amountCents: number }> }> }) {
  return <div className="settlement-chip-list">{rows.length ? rows.map(row => <span key={row.period}><small>{row.period}</small><strong>{moneyExact(row.amountCents)}</strong>{row.items?.map((item, index) => <small key={index}>{item.name}: {moneyExact(item.amountCents)}</small>)}</span>) : <p className="muted-copy">Bez dohledatelných záloh.</p>}</div>;
}
