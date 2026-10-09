import type { ReactNode } from "react";

/** Keep the full authorized history available without extending the initial page. */
export function HistoryTable({ headers, rows, columns, empty, historyLabel = "Starší záznamy", limit = 10 }: {
  headers: ReactNode; rows: ReactNode[]; columns: number; empty: string; historyLabel?: string; limit?: number;
}) {
  const table = (items: ReactNode[]) => <div className="table-wrap"><table><thead><tr>{headers}</tr></thead><tbody>{items.length ? items : <tr><td className="table-empty" colSpan={columns}>{empty}</td></tr>}</tbody></table></div>;
  return <div className="recent-history">{table(rows.slice(0, limit))}{rows.length > limit && <details className="history-disclosure"><summary>{historyLabel} ({rows.length - limit})</summary>{table(rows.slice(limit))}</details>}</div>;
}
