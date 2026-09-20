import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import { date } from "@/lib/format";
import { complianceResults } from "@/lib/labels";
import { DocumentAttachments, type DocumentListItem } from "@/components/documents/DocumentAttachments";

type Record = {
  id: string; performedAt: Date; result: string; performedBy: string | null;
  nextDueAt: Date | null; note: string | null; createdBy: { name: string } | null;
  documents: DocumentListItem[];
};

export function ComplianceHistory({ records, propertyId, canManage = false }: { records: Record[]; propertyId?: string; canManage?: boolean }) {
  return <details className="compliance-history">
    <summary>Historie kontrol a protokoly ({records.length})</summary>
    {records.length ? records.map(record => <article className="compliance-history-record" key={record.id}>
      <h3>{date(record.performedAt)} · {complianceResults[record.result] || record.result}</h3>
      <p>Provedl: {record.performedBy || "Neuvedeno"} · Zaznamenal: {record.createdBy?.name || "Neuvedeno"}</p>
      {record.nextDueAt && <p>Navazující termín: {date(record.nextDueAt)}</p>}
      {record.note && <p className="compliance-history-note">{record.note}</p>}
      <DocumentAttachments documents={record.documents} empty="Protokol není přiložen."/>
      {canManage && propertyId && <details><summary>Přiložit protokol z revize</summary><DocumentUploadForm propertyId={propertyId} complianceRecordId={record.id} category="INSPECTION_PROTOCOL" title="Revizní protokol" returnTo={`/nemovitosti/${propertyId}/provoz#revize`}/></details>}
    </article>) : <p className="muted-copy">Zatím nebyla zaznamenána žádná kontrola.</p>}
  </details>;
}
