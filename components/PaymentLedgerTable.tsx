import { HistoryTable } from "./HistoryTable";
import Link from "next/link";
import { date, money } from "@/lib/format";
import { payerPresentation, type PaymentLedgerRow } from "@/lib/payment-ledger";

export function PaymentLedgerTable({ rows, showLocation = false, empty, recentLimit }: { rows: PaymentLedgerRow[]; showLocation?: boolean; empty: string; recentLimit?: number }) {
  return <HistoryTable limit={recentLimit ?? rows.length} historyLabel="Starší bankovní pohyby" columns={showLocation ? 7 : 6} empty={empty} headers={<><th>Datum</th>{showLocation && <th>Nemovitost / jednotka</th>}<th>Zaúčtování</th><th>Plátce / protistrana</th><th>VS / zpráva</th><th>Zaúčtováno / přiřazeno</th><th></th></>} rows={rows.map((row) => {
    const payer = payerPresentation(row);
    return <tr key={row.id}><td>{date(row.effectiveAt || row.bookedAt)}{row.effectiveAt && row.effectiveAt.getTime() !== row.bookedAt.getTime() && <small>Bankovní transakce: {date(row.bookedAt)}</small>}</td>{showLocation && <td><strong>{row.propertyName}</strong><small>{row.unitLabel} · {row.tenantName}</small></td>}<td><strong>{row.accountingType}</strong><small>{row.chargePeriod ? `Předpis ${row.chargePeriod}` : row.contractNumber ? `Smlouva ${row.contractNumber}` : row.tenantName}</small></td><td><strong>{payer.primary}</strong>{payer.secondary && <small>Účet plátce: {payer.secondary}</small>}</td><td>{row.variableSymbol ? `VS ${row.variableSymbol}` : "VS —"}<small>Zpráva z banky: {row.message || "neuvedena"}</small></td><td className="money"><strong>{money(row.allocatedAmountCents)}</strong><small>Transakce celkem: {money(row.transactionAmountCents)}</small></td><td><Link className="table-link" href={`/nemovitosti/${row.propertyId}/platby/${row.transactionId}`}>Bankovní transakce</Link></td></tr>;
  })}/>;
}
